/**
 * ブラウザ用のモック実装（`pnpm dev:web`）。
 *
 * 04.tech-stack/07-dev-tools.md §1: UI の反復を Tauri のビルドサイクルから切り離す。
 * Platform 層があることで、UI の 8 割はブラウザだけで開発できる。
 *
 * ファイルは `localStorage` 上の仮想 FS に置く。EOL/BOM/mtime のセマンティクスは
 * Rust 実装と同じ形で再現するが、**原子性と衝突検知の正しさは保証しない**。
 * そこは Rust 側のユニットテストの担当。
 */
import { splitPath } from '@/lib/path';

import {
  DEFAULT_PANES,
  DEFAULT_SETTINGS,
  NO_CUSTOM_CSS,
  SPLIT_DEFAULT,
  type Bootstrap,
  type CustomCss,
  type DiscardChoice,
  type DocumentPayload,
  type OpenRequest,
  type Panes,
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
 * **「壊れていたら上書きしない」という 02.architecture/04-rust-responsibilities.md §5 の肝は Rust 側の担当**であり、
 * ブラウザには壊しようがない。
 */
interface WebState {
  recent: RecentEntry[];
  zoom: number;
  /** ペインの開閉と幅（03.ux-spec/06-panes.md §3）。実装では `state.json` の `panes`。 */
  panes: Panes;
  /** Split の分割比（03.ux-spec/03-split-mode.md §1）。 */
  split: number;
  settings: Settings;
  /** `custom.css` の中身（02.architecture/10-theming.md §3）。空文字は「ファイルが無い」。 */
  customCss: string;
}

function loadState(): WebState {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Partial<WebState>;
    return {
      recent: raw.recent ?? [],
      zoom: raw.zoom ?? 1,
      // 実装（Rust）と同じく、欠けていれば「閉じている」。03.ux-spec/06-panes.md §3 の引用ブロック
      panes: { ...DEFAULT_PANES, ...raw.panes },
      split: raw.split ?? SPLIT_DEFAULT,
      // 欠けたキーは既定値。実装（Rust）と同じく、読んだ時点で埋める
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      customCss: raw.customCss ?? '',
    };
  } catch {
    return {
      recent: [],
      zoom: 1,
      panes: DEFAULT_PANES,
      split: SPLIT_DEFAULT,
      settings: DEFAULT_SETTINGS,
      customCss: '',
    };
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

## 前倒した記法（OQ-27）

> [!NOTE]
> GitHub Alerts は 5 種類ある。

> [!TIP]
> 色とアイコンの確認用。

> [!IMPORTANT]
> 重要。

> [!WARNING]
> 警告。

> [!CAUTION]
> 危険。

- [x] タスクリスト（チェック済み）
- [ ] タスクリスト（未チェック）
  - [ ] ネストしたタスク
- 普通の箇条書きと混ざった場合

脚注はこう書く[^note]。

[^note]: 本文の末尾にまとまって出る。
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

  // `?welcome` で「引数なし起動」を再現する。Welcome 画面（03.ux-spec/08-empty-states.md §1）を
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
    // `?rightPane` でライトペインを開いた状態の起動を再現する。
    // **実装と同じく bootstrap に載って届く**ので、dev:web でも
    // 「本文が全幅で描かれてから横に詰まる」瞬間が無いことを確認できる。
    panes: params.has('rightPane') ? { ...state.panes, right: { ...state.panes.right, open: true } } : state.panes,
    split: state.split,
    settings: state.settings,
    // `?brokenSettings` で「settings.json が壊れている」起動を再現する。
    // 通知バー（03.ux-spec/07-status-and-notifications.md §2）と設定 UI の読み取り専用状態を
    // ブラウザだけで確認できるようにするため。
    settingsError: brokenSettings(),
    // 実装と同じく**同梱して届く**（02.architecture/10-theming.md §3）。
    // 後から当てる形にすると、dev:web でだけ FOUC が見えない。
    customCss: customCssNow(),
  };
}

/**
 * dev:web のカスタム CSS（02.architecture/10-theming.md §3）。
 *
 * ブラウザに `%APPDATA%` は無いので、中身は `localStorage` に置く。
 * `?customCss` を付けると見本が入り、`@scope` の効き方
 * （**本文には効き、クロームには効かない**）をブラウザだけで確認できる。
 * `?customCss=escape` は**閉じ過ぎた CSS** で、適用を拒否する経路の再現。
 */
function customCssNow(): CustomCss {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const variant = params.get('customCss');

  if (variant === 'escape') return { ...NO_CUSTOM_CSS, css: ESCAPING_CUSTOM_CSS };
  if (variant === 'too-large') {
    return {
      ...NO_CUSTOM_CSS,
      problem: { kind: 'too-large', path: '/virtual/custom.css', message: '2097152 bytes > 1048576 bytes' },
    };
  }

  const css = params.has('customCss') ? SAMPLE_CUSTOM_CSS : loadState().customCss;
  return { ...NO_CUSTOM_CSS, css: css === '' ? null : css };
}

/** 見本。**本文にしか当たらない**ことが分かるよう、見出しと本文幅の両方を触る。 */
const SAMPLE_CUSTOM_CSS = `:scope {
  --mx-content-width: 70ch;
}

h1 {
  color: rebeccapurple;
  border-bottom: 2px dashed currentColor;
}

blockquote {
  border-inline-start-width: 6px;
}
`;

/**
 * **クロームを消そうとする CSS**（`}` でブロックを閉じて外へ出る）。
 *
 * `applyCustomCss` がこれを拒否することがカスタム CSS の要点で、
 * 実アプリでも `?customCss=escape` と同じものを `custom.css` に書けば同じ結果になる。
 */
const ESCAPING_CUSTOM_CSS = `h1 { color: red }
}
.mx-titlebar { display: none }
`;

const BROKEN_SETTINGS_SAMPLE: SettingsProblem = {
  path: '/virtual/settings.json',
  message: 'expected `,` or `}` at line 3 column 1',
};

/** `?brokenSettings` で「壊れた settings.json」を再現しているか。 */
function brokenSettings(): SettingsProblem | null {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return params.has('brokenSettings') ? BROKEN_SETTINGS_SAMPLE : null;
}

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

  async setPanes(panes) {
    const state = loadState();
    state.panes = panes;
    saveState(state);
  },

  async setSplit(split) {
    const state = loadState();
    state.split = split;
    saveState(state);
  },

  /**
   * `?brokenSettings` の間は「壊れている」と答え続ける。
   *
   * 実装では**壊れた事実が保存を止める**（02.architecture/04-rust-responsibilities.md §5）。
   * ブラウザには壊しようがないので、設定 UI の読み取り専用状態を
   * dev:web で確認する手段がここしかない。
   */
  async readSettings() {
    return { values: loadState().settings, broken: brokenSettings() };
  },

  async writeSettings(patch) {
    // 壊れているときは Rust 側（`AppState::patch_settings`）が拒否する。
    // UI が「保存できたように見せる」ことのほうが害が大きいので、口も合わせておく。
    const broken = brokenSettings();
    if (broken) throw { kind: 'settings-broken', message: broken.message };

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

  async readCustomCss() {
    return customCssNow();
  },

  async openCustomCssFile() {
    // 実装では「無ければ雛形を作ってから開く」。ブラウザには開く先が無いので、
    // 見本を仮想の `custom.css` に置いて、次の読み直しから効くようにする。
    const state = loadState();
    if (state.customCss === '') {
      state.customCss = SAMPLE_CUSTOM_CSS;
      saveState(state);
    }
    console.info('[marxdown] openCustomCssFile');
  },

  onCustomCssChanged() {
    // 仮想の `custom.css` を外から書き換える経路が無い（`onSettingsChanged` と同じ）
    return () => {};
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

  /**
   * 保存先（F-EDIT-02）。**ブラウザにはネイティブの保存ダイアログが無い**ので、
   * 仮想 FS 上の名前を尋ねるだけにしてある。実際の書き込み先は `localStorage`。
   */
  async pickSavePath(suggested) {
    const base = suggested === null ? 'untitled.md' : splitPath(suggested).name || 'untitled.md';
    const name = globalThis.prompt('保存先のファイル名（dev:web の仮想 FS）', base);
    return name === null || name.trim() === '' ? null : `/virtual/${name.trim()}`;
  },

  /**
   * dev:web には終了の経路もトレイも無い（`close.rs` に対応するものが無い）ので、
   * 知らせる相手が居ない。**受け取って捨てる。**
   */
  setDirty() {
    return Promise.resolve();
  },

  /**
   * ブラウザに 3 択のネイティブダイアログは無い。**「保存して開く」を落として
   * 2 択にする**（`confirm` は真偽しか返さない）。
   *
   * 落としてよいのは、これが `dev:web` の経路だからで、**既定を
   * 「移らない」側に倒す**点だけは製品と同じにしてある（N-REL-01）。
   */
  confirmDiscard() {
    const discard = globalThis.confirm('保存していない変更があります。破棄して開きますか？');
    return Promise.resolve<DiscardChoice>(discard ? 'discard' : 'cancel');
  },

  onSaveAndQuit() {
    // 終了の確認は Rust 側の経路（`close.rs`）。dev:web では起きない。
    return () => {};
  },

  async watchPath() {
    // 仮想 FS はこのタブの中にしかなく、外から書き換わることがない。
    // 監視の有無で Domain 層の分岐が増えないよう、口だけ合わせておく
  },

  async unwatchPath() {
    // 同上
  },

  onFileChanged() {
    return () => {};
  },

  onSettingsChanged() {
    return () => {};
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

  /*
   * ウィンドウ操作。ブラウザにはタブを最小化する概念も、閉じさせる権限も無い。
   * **口だけ合わせて何もしない。** ここで `window.close()` を呼ぶような
   * 「それらしい代用」をすると、dev:web でタイトルバーを触るたびに画面が消える。
   */
  async minimizeWindow() {},

  async toggleMaximizeWindow() {},

  async closeWindow() {},

  // ブラウザにはトレイもプロセスも無い。**握り潰さずログに出す**のは、
  // `dev:web` で「終了」を押したときに何も起きない理由が分かるようにするため。
  async quitApp() {
    console.info('[marxdown] quitApp（ブラウザでは何も起きない）');
  },

  onTrayOpen() {
    return () => {};
  },

  onTrayResume() {
    return () => {};
  },

  async isWindowMaximized() {
    return false;
  },

  onWindowMaximizedChanged() {
    return () => {};
  },

  // Snap Layouts は Windows のウィンドウ管理の機能。ブラウザには相当物が無い。
  async setSnapLayoutsTarget() {},

  onMaximizeHoverChanged() {
    return () => {};
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
