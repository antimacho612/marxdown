/**
 * ブラウザ用のモック実装（`pnpm dev:web`）。
 *
 * 04.tech-stack.md §7.1: UI の反復を Tauri のビルドサイクルから切り離す。
 * Platform 層があることで、UI の 8 割はブラウザだけで開発できる。
 *
 * ファイルは `localStorage` 上の仮想 FS に置く。EOL/BOM/mtime のセマンティクスは
 * Rust 実装と同じ形で再現するが、**原子性と衝突検知の正しさは保証しない**。
 * そこは Rust 側のユニットテストの担当。
 */
import {
  DEFAULT_SETTINGS,
  type Bootstrap,
  type DocumentPayload,
  type OpenRequest,
  type Platform,
  type RecentEntry,
  type SaveResult,
  type Settings,
  type SettingsProblem,
  type WriteRequest,
} from './types';

const STORE_KEY = 'marxdown:web-fs';
const STATE_KEY = 'marxdown:web-state';

interface VirtualFile {
  content: string;
  mtimeMs: number;
}

function loadFs(): Record<string, VirtualFile> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, VirtualFile>;
  } catch {
    return {};
  }
}

function saveFs(fs: Record<string, VirtualFile>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(fs));
  } catch {
    // 容量超過。dev 専用なので黙って諦める
  }
}

/**
 * `src-tauri/src/store.rs` の `StoreData` と `settings.rs` の `Settings` に対応するモック。
 *
 * 実装では 2 ファイルに分かれている（`state.json` / `settings.json`）が、
 * ここで再現したいのは値の往復だけなので 1 つのキーにまとめる。
 * **「壊れていたら上書きしない」という §4.5 の肝は Rust 側の担当**であり、
 * ブラウザには壊しようがない。
 */
interface WebState {
  recent: RecentEntry[];
  zoom: number;
  settings: Settings;
}

function loadState(): WebState {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Partial<WebState>;
    return {
      recent: raw.recent ?? [],
      zoom: raw.zoom ?? 1,
      // 欠けたキーは既定値。実装（Rust）と同じく、読んだ時点で埋める
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    };
  } catch {
    return { recent: [], zoom: 1, settings: DEFAULT_SETTINGS };
  }
}

function saveState(state: WebState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // 容量超過。dev 専用なので黙って諦める
  }
}

const SAMPLE = `# Marxdown — dev:web

Tauri を起動せずに UI を反復するためのモック環境。ファイル I/O は
\`localStorage\` 上の仮想 FS に置き換わっている。

## 確認できること

- Markdown パイプラインと Worker
- プレビューのタイポグラフィとテーマ
- 段階的描画

## 確認できないこと

- 起動時間（WebView2 の初期化が無い）
- 単一インスタンスの argv 転送
- EOL / BOM の保持

\`\`\`ts
const platform: Platform = import.meta.env.DEV ? webPlatform : tauriPlatform
\`\`\`

> Platform 層があることで、この 2 つは同じ Domain 層から使える。
`;

/**
 * 実ファイルを仮想 FS に取り込み、仮想パスを返す。
 *
 * ブラウザは選ばれた / 落とされたファイルの絶対パスを渡さない。
 * dev:web ではそれで構わないので、`/virtual/<名前>` を割り当てて中身だけ取り込む。
 */
async function adoptFile(file: File): Promise<string | null> {
  const path = `/virtual/${file.name}`;
  try {
    const fs = loadFs();
    fs[path] = { content: await file.text(), mtimeMs: file.lastModified };
    saveFs(fs);
    return path;
  } catch {
    return null;
  }
}

/** URL の `?file=` で内容を差し替えられるようにしておくと、fixture の確認が楽になる。 */
function initialBootstrap(): Bootstrap {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const path = params.get('file') ?? '/virtual/welcome.md';
  const fs = loadFs();
  const existing = fs[path];
  const content = existing?.content ?? SAMPLE;
  const state = loadState();

  // `?welcome` で「引数なし起動」を再現する。Welcome 画面（03.ux-spec.md §9.1）を
  // ブラウザだけで作り込めるようにするため。
  const empty = params.has('welcome');

  return {
    version: 1,
    document: empty
      ? null
      : {
          path,
          content,
          eol: 'lf',
          bom: false,
          encoding: 'utf8',
          mtimeMs: existing?.mtimeMs ?? Date.now(),
          size: new TextEncoder().encode(content).length,
          readonly: false,
        },
    documentError: null,
    mode: (params.get('mode') as Bootstrap['mode']) ?? null,
    spike: { parse: (params.get('parse') as 'worker' | 'main') ?? 'worker' },
    trace: { enabled: params.has('trace'), t0EpochMs: Date.now() },
    pendingPaths: [],
    unknownArgs: [],
    recent: state.recent,
    zoom: state.zoom,
    settings: state.settings,
    // `?brokenSettings` で「settings.json が壊れている」起動を再現する。
    // 通知バー（03.ux-spec.md §8.2）をブラウザだけで確認できるようにするため。
    settingsError: params.has('brokenSettings') ? BROKEN_SETTINGS_SAMPLE : null,
  };
}

const BROKEN_SETTINGS_SAMPLE: SettingsProblem = {
  path: '/virtual/settings.json',
  message: 'expected `,` or `}` at line 3 column 1',
};

let bootstrap: Bootstrap | null = null;

export const webPlatform: Platform = {
  kind: 'web',

  getBootstrap() {
    bootstrap ??= initialBootstrap();
    return bootstrap;
  },

  async readDocument(path): Promise<DocumentPayload> {
    const fs = loadFs();
    const file = fs[path];
    if (!file) throw { kind: 'not-found', message: path };
    return {
      path,
      content: file.content,
      eol: 'lf',
      bom: false,
      encoding: 'utf8',
      mtimeMs: file.mtimeMs,
      size: new TextEncoder().encode(file.content).length,
      readonly: false,
    };
  },

  async writeDocument(req: WriteRequest): Promise<SaveResult> {
    const fs = loadFs();
    const existing = fs[req.path];
    if (existing && existing.mtimeMs !== req.expectedMtimeMs) {
      return { status: 'conflict', diskMtimeMs: existing.mtimeMs };
    }
    const mtimeMs = Date.now();
    fs[req.path] = { content: req.content, mtimeMs };
    saveFs(fs);
    return { status: 'saved', mtimeMs, size: new TextEncoder().encode(req.content).length };
  },

  async resolveAsset(href) {
    return href;
  },

  async pushRecent(path) {
    const state = loadState();
    state.recent = [{ path, openedAtMs: Date.now() }, ...state.recent.filter((e) => e.path !== path)].slice(0, 20);
    saveState(state);
    return state.recent;
  },

  async removeRecent(path) {
    const state = loadState();
    state.recent = state.recent.filter((e) => e.path !== path);
    saveState(state);
    return state.recent;
  },

  async setZoom(zoom) {
    const state = loadState();
    state.zoom = zoom;
    saveState(state);
  },

  async readSettings() {
    return { values: loadState().settings, broken: null };
  },

  async writeSettings(patch) {
    const state = loadState();
    const merged: Settings = { ...state.settings };
    for (const [key, value] of Object.entries(patch)) {
      // `null` はキーの削除（＝既定値に戻す）。Rust 側と同じ意味にする
      if (value === null) Object.assign(merged, { [key]: DEFAULT_SETTINGS[key as keyof Settings] });
      else Object.assign(merged, { [key]: value });
    }
    state.settings = merged;
    saveState(state);
    return merged;
  },

  async openSettingsFile() {
    // ブラウザには既定アプリの概念が無い。呼ばれたことだけ分かるようにしておく
    console.info('[marxdown] openSettingsFile');
  },

  async pickFile() {
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,text/markdown';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        void adoptFile(file).then(resolve);
      });
      // 取り消しは change が飛ばない。dev 用なので待ちっぱなしを許容する
      input.click();
    });
  },

  onDragDrop(handler) {
    // ブラウザには OS のドラッグ＆ドロップイベントが無いので HTML5 で代用する。
    // 実装では絶対パスが取れないため、落ちてきた中身を仮想 FS に取り込んでから
    // その仮想パスを渡す。Domain 層から見た形は Tauri 実装と同じになる。
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      handler({ type: 'over' });
    };
    const onLeave = () => handler({ type: 'leave' });
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      void Promise.all(files.map(adoptFile)).then((paths) => {
        handler({ type: 'drop', paths: paths.filter((p): p is string => p !== null) });
        return paths;
      });
    };

    globalThis.addEventListener('dragover', onOver);
    globalThis.addEventListener('dragleave', onLeave);
    globalThis.addEventListener('drop', onDrop);

    return () => {
      globalThis.removeEventListener('dragover', onOver);
      globalThis.removeEventListener('dragleave', onLeave);
      globalThis.removeEventListener('drop', onDrop);
    };
  },

  async ready() {
    // ブラウザにはウィンドウの表示制御が無い
  },

  async reportTrace(marks) {
    console.info('[marxdown] trace', marks);
  },

  async warmDone() {
    // ブラウザには argv 転送が無い
    return null;
  },

  async openExternal(url) {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  },

  async openLocalFile(path) {
    // ブラウザには既定アプリの概念が無い。呼ばれたことだけ分かるようにしておく
    console.info('[marxdown] openLocalFile', path);
  },

  async revealInFileManager() {
    // ブラウザでは何もできない
  },

  onOpenRequest(_handler: (req: OpenRequest) => void) {
    return () => {};
  },
};
