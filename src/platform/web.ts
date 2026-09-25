/**
 * ブラウザ用のモック実装（`pnpm dev:web`）。
 *
 * 04.tech-stack/07-dev-tools.md §1: UI の反復を Tauri のビルドサイクルから切り離す。
 * Platform 層があることで、UI の 8 割はブラウザだけで開発できる。
 *
 * ファイルは `localStorage` 上の仮想 FS に置く。
 * EOL / BOM / mtime の扱いは Rust 実装と同じ形で再現するが、原子性と衝突検知の正しさは保証しない。
 * そちらは Rust 側のユニットテストで検証する。
 */
import { splitPath } from '@/lib/path';

import { DEFAULT_SETTINGS, type Settings } from './settings-schema';
import {
  DEFAULT_PANES,
  SPLIT_DEFAULT,
  type Bootstrap,
  type CoreError,
  type DiscardChoice,
  type DocumentPayload,
  type OpenRequest,
  type Panes,
  type Platform,
  type RecentEntry,
  type SaveResult,
  type SettingsProblem,
  type UserTheme,
  type WindowRole,
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
    // 容量超過。dev 専用のため何もしない
  }
}

/**
 * `src-tauri/src/store.rs` の `StoreData` と `settings/schema.rs` の `Settings` に対応するモック。
 *
 * 実装では 2 ファイルに分かれている（`state.json` / `settings.json`）が、ここで再現するのは値の往復だけであるため 1 つのキーにまとめる。
 * 壊れていたら上書きしないという 02.architecture/04-rust-responsibilities.md §5 の要点は Rust 側が担当しており、ブラウザ側では再現しない。
 */
interface WebState {
  recent: RecentEntry[];
  zoom: number;
  /** ペインの開閉と幅（03.ux-spec/06-panes.md §3）。実装では `state.json` の `panes`。 */
  panes: Panes;
  /** Split の分割比（03.ux-spec/03-split-mode.md §1）。 */
  split: number;
  settings: Settings;
  /** `themes/` に置いた配色。実装ではディレクトリ 1 つ、ここでは配列 1 本。 */
  userThemes: UserTheme[];
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
      userThemes: raw.userThemes ?? [],
    };
  } catch {
    return {
      recent: [],
      zoom: 1,
      panes: DEFAULT_PANES,
      split: SPLIT_DEFAULT,
      settings: DEFAULT_SETTINGS,
      userThemes: [],
    };
  }
}

function saveState(state: WebState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // 容量超過。dev 専用なので何もしない
  }
}

/*
 * TeX の `\begin{aligned}` が `${aligned}` の書き損じに見えるため、この定数の間だけ無効にする。
 * 中身は Markdown の本文であって、テンプレートリテラルの補間を意図した箇所は無い。
 */
/* eslint-disable unicorn/no-incorrect-template-string-interpolation */
const SAMPLE = `# Marxdown — dev:web

Tauri を起動せずに UI を反復するためのモック環境。ファイル I/O は
\`localStorage\` 上の仮想 FS に置き換わっている。

## 確認できること

- Markdown パイプライン
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

## GitHub 由来の拡張記法

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

## 表（F-EDIT-11）

| 記法 | 対応 | 備考 |
| --- | --- | --- |
| GFM のテーブル | 済 | Tab でセル移動、Shift+Alt+F で整形 |
| 日本語の列 | 済 | 全角を 2 桁として揃える |

## 追加記法（既定 OFF）

設定で有効にするまで、下の記法は素のテキストのまま残る。

H~2~O / x^2^ / ==マーカー== / ++挿入++

用語
: 定義リストの説明

## 数式（F-VIEW-13）

インラインは $E = mc^2$ のように書く。$5 と $10 は数式にならない。

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

$$
\\begin{aligned}
a &= b + c \\\\
  &= d
\\end{aligned}
$$

## Mermaid（F-VIEW-12）

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[markdown-it]
  B --> C[DOMPurify]
  C --> D[DOM]
\`\`\`

描けない記述はコードブロックとして残る。

\`\`\`mermaid
これは Mermaid の記法ではない
\`\`\`
`;
/* eslint-enable unicorn/no-incorrect-template-string-interpolation */

/**
 * 実ファイルを仮想 FS に取り込み、仮想パスを返す。
 *
 * ブラウザは選ばれた / ドロップされたファイルの絶対パスを渡さない。
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

/** URL の `?file=` で内容を差し替えられるようにしておくと、fixture を確認しやすくなる。 */
function initialBootstrap(): Bootstrap {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const path = params.get('file') ?? '/virtual/welcome.md';
  const fs = loadFs();
  const existing = fs[path];
  const content = existing?.content ?? SAMPLE;
  const state = loadState();

  // `?welcome` で「引数なし起動」を再現する。Welcome 画面（03.ux-spec/08-empty-states.md §1）をブラウザだけで作り込めるようにするため。
  const empty = params.has('welcome');

  // `?satellite` でサテライトのシェルを再現する（F-OPEN-06）。
  // 実機ではタブを別ウィンドウへ移さないと現れない面であり、ブラウザだけで作り込めるようにしておく。
  const role: WindowRole = params.has('satellite') ? 'satellite' : 'main';

  return {
    version: 1,
    role,
    transfer: null,
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
    // `?benchInput` で計測経路をブラウザからも起動できるようにしておく。
    // 計測値は参考にならない（dev サーバはモジュールを 1 つずつ配信し、Monaco の読み込みだけで数十秒かかる）。
    // この経路があるのは、処理が動作することを Tauri のビルドなしで確認するためである。
    benchInput: params.has('benchInput'),
    trace: { enabled: params.has('trace'), t0EpochMs: Date.now() },
    pendingPaths: [],
    session: [],
    sessionActive: 0,
    workspaceRoot: null,
    unknownArgs: [],
    recent: state.recent,
    zoom: state.zoom,
    // `?rightPane` でライトペインを開いた状態の起動を再現する。
    // 実装と同じく bootstrap に載って届くため、dev:web でも本文が全幅で描画された後に幅が縮小する瞬間が無いことを確認できる。
    panes: params.has('rightPane') ? { ...state.panes, right: { ...state.panes.right, open: true } } : state.panes,
    split: state.split,
    settings: state.settings,
    // `?brokenSettings` で「settings.json が壊れている」起動を再現する。
    // 通知バー（03.ux-spec/07-status-and-notifications.md §2）と設定 UI の読み取り専用状態をブラウザだけで確認できるようにするため。
    settingsError: brokenSettings(),
    // 実装と同じく bootstrap に同梱して届く（02.architecture/10-theming.md §3.3）。
    // 後から適用する形にすると、dev:web でだけ既定の配色で 1 フレーム描かれる経路が再現しなくなる。
    previewTheme: previewThemeNow(state),
  };
}

/**
 * bootstrap に載せるプレビューの配色（02.architecture/10-theming.md §3.3）。
 *
 * 実装（Rust）と同じく、選択中の id に一致する `themes/` のファイルがあるときだけ載せる。
 * 組み込みの配色を選んでいる場合は `null` で、フロントが `theme` チャンクの取得を待つ経路に入る。
 *
 * `?userTheme=escape` はブロックを余分に閉じた宣言で、適用を拒否する経路を再現する。
 */
function previewThemeNow(state: WebState): UserTheme | null {
  const id = state.settings['preview.theme'];
  if (id === 'default') return null;

  return userThemesNow().find((theme) => theme.id === id) ?? null;
}

/**
 * dev:web の `themes/`。
 *
 * ブラウザに `%APPDATA%` は無いため、中身は `localStorage` に置く。
 * `?userTheme` を付けると、組み込みと同じ id の配色が 1 枚置かれた状態を再現する。
 * `?userTheme=escape` は面の外へ出ようとする 1 枚で、拒否される経路を確認できる。
 */
function userThemesNow(): UserTheme[] {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  if (params.get('userTheme') === 'escape') return [ESCAPING_USER_THEME];
  if (params.has('userTheme')) return [SAMPLE_USER_THEME];
  return loadState().userThemes;
}

/**
 * ユーザーが追加した配色の見本。
 *
 * 組み込みと同じ id にして、置き換えが機能することをブラウザだけで確認できるようにしてある。
 * 宣言だけでなくセレクタを含めてあるのは、包まれた後に CSS のネスト規則として適用されることを見せるためである。
 */
const SAMPLE_USER_THEME: UserTheme = {
  id: 'dracula',
  declarations: `color-scheme: dark;
--mx-color-bg: #12121a;
--mx-color-code-string: #f1fa8c;
h1 { border-bottom: 2px dashed currentColor }
`,
};

/**
 * クロームを非表示にしようとする配色（`}` でブロックを閉じてセレクタの外へ出る）。
 *
 * `injectTheme` がこれを拒否することが封じ込めの要点であり、実アプリでも同じ内容を `themes/` に置けば同じ結果になる。
 */
const ESCAPING_USER_THEME: UserTheme = {
  id: 'escaping',
  declarations: `--mx-color-bg: #101010;
}
.mx-titlebar { display: none }
`,
};

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

/** ブラウザ上での Platform 実装。`pnpm dev:web` とテストで使う。 */
export const webPlatform: Platform = {
  kind: 'web',

  getBootstrap() {
    bootstrap ??= initialBootstrap();
    return bootstrap;
  },

  async readDocument(path, encoding): Promise<DocumentPayload> {
    const fs = loadFs();
    const file = fs[path];
    if (!file) throw { kind: 'not-found', message: path };
    return {
      path,
      content: file.content,
      eol: 'lf',
      bom: false,
      // モックのファイルは常に UTF-8 である。
      // 指定された値をそのまま返すため、再解釈の UI（03.ux-spec/07-status-and-notifications.md §3）は `dev:web` でも動作する。
      encoding: encoding ?? 'utf8',
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

  /**
   * `dev:web` にはディスクが無い。
   *
   * 保存したふりをして相対パスだけ返す。挿入される Markdown の形と、無題の文書を拒否する経路は確認できる。
   * 実際に書けているかどうかは Rust 側のテスト（`src-tauri/src/asset.rs`）が見る。
   */
  async writeAsset(documentPath, extension) {
    const name = documentPath.split('/').pop() ?? 'untitled.md';
    return `${name}.assets/paste-${String(Date.now())}.${extension}`;
  },

  /** 仮想 FS にはスコープが無い。許可するものも無いので、そのまま返す。 */
  async allowImageDir(href) {
    return href;
  },

  /**
   * `dev:web` の仮想 FS にはディレクトリが無い。
   *
   * 実体を返さないのは、ここで木構造を模しても確かめられるのが並べ方だけだからである。
   * ファイルツリーの見た目は Storybook で見る（`FileTree.stories.svelte`）。
   */
  async listDir() {
    return [];
  },

  /** 同じ理由で候補も返さない。クイックオープンは開くが、一覧は空になる。 */
  async listFiles() {
    return { files: [], truncated: false };
  },

  /** `dev:web` では復元しない。起動のたびに同じ状態から始まるほうが確かめやすい。 */
  async setSession() {},

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
   * 実装では壊れているという事実が保存を止める（02.architecture/04-rust-responsibilities.md §5）。
   * ブラウザ側では壊れた状態を作れないため、設定 UI の読み取り専用状態を dev:web で確認する手段はここだけである。
   */
  async readSettings() {
    return { values: loadState().settings, broken: brokenSettings() };
  },

  async writeSettings(patch) {
    // 壊れているときは Rust 側（`AppState::patch_settings`）が拒否する。
    // UI が「保存できたように見せる」ことのほうが害が大きいので、拒否する挙動も合わせておく。
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
    // ブラウザには既定アプリの概念が無い。呼び出されたことだけ分かるようにしておく
    console.info('[marxdown] openSettingsFile');
  },

  async listUserThemes() {
    return userThemesNow();
  },

  async openThemesDir() {
    // 実装では「無ければ作って雛形を置いてから開く」。
    // ブラウザには開く先が無いので、見本を仮想の `themes/` に置いて、次の読み直しから適用されるようにする。
    const state = loadState();
    if (state.userThemes.length === 0) {
      state.userThemes = [SAMPLE_USER_THEME];
      saveState(state);
    }
    console.info('[marxdown] openThemesDir');
  },

  onUserThemesChanged() {
    // 仮想の `themes/` を外から書き換える経路が無い（`onSettingsChanged` と同じ）
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
      // 取り消しでは change が発火しない。dev 用なので待ったままになることを許容する
      input.click();
    });
  },

  /**
   * フォルダ選択（F-NAV-03）。
   *
   * ブラウザにはネイティブのフォルダ選択ダイアログが無く、`listDir` も空を返す。
   * ここで確かめられるのは「基点が決まる前と後で Explorer の表示が入れ替わること」だけであるため、名前を入力させて仮想 FS 上のパスにする。取り消しは `null` を返す。
   */
  async pickFolder() {
    const name = globalThis.prompt('開くフォルダ名（dev:web の仮想 FS）', 'virtual');
    return name === null || name.trim() === '' ? null : `/${name.trim()}`;
  },

  /**
   * 保存先（F-EDIT-02）。
   * ブラウザにはネイティブの保存ダイアログが無いため、仮想 FS 上の名前を入力させるだけにしてある。
   * 実際の書き込み先は `localStorage` である。
   */
  async pickSavePath(suggested) {
    const base = suggested === null ? 'untitled.md' : splitPath(suggested).name || 'untitled.md';
    const name = globalThis.prompt('保存先のファイル名（dev:web の仮想 FS）', base);
    return name === null || name.trim() === '' ? null : `/virtual/${name.trim()}`;
  },

  /** ブラウザのダウンロードとして書き出す。保存先は選べない。 */
  async exportHtml(html, suggested) {
    const name = `${(suggested === null ? 'untitled' : splitPath(suggested).name).replace(/\.[^.]*$/, '')}.html`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return name;
  },

  /** ブラウザには PDF を直接書き出す手段が無い。呼び出し側が `window.print()` で代用する。 */
  async exportPdf() {
    throw { kind: 'invalid-argument', message: 'dev:web では PDF を直接書き出せない' } satisfies CoreError;
  },

  /** dev:web の画像は元から data URI か外部の URL である。 */
  async inlineImage(src) {
    return src;
  },

  /**
   * dev:web には終了の経路もトレイも無く（`close.rs` に対応するものが無い）、通知先が存在しないため何もしない。
   */
  setDirty() {
    return Promise.resolve();
  },

  /**
   * ブラウザに 3 択のネイティブダイアログは無いため、「保存して開く」を除いた 2 択にする（`confirm` は真偽値しか返さない）。
   *
   * 選択肢を減らせるのは `dev:web` の経路だからであり、既定を移らない側にする点だけは製品と同じにしてある（N-REL-01）。
   */
  confirmDiscard() {
    const discard = globalThis.confirm('保存していない変更があります。破棄して開きますか？');
    return Promise.resolve<DiscardChoice>(discard ? 'discard' : 'cancel');
  },

  onSaveAndQuit() {
    // 終了の確認は Rust 側の経路（`close.rs`）にあり、dev:web では発生しない。
    return () => {};
  },

  onSaveAndClose() {
    // ウィンドウを閉じる確認も同じ経路である（`close.rs`）。
    return () => {};
  },

  async watchPath() {
    // 仮想 FS はこのタブの中にしかなく、外部から書き換わることがない。
    // 監視の有無で Domain 層に分岐が増えないよう、インタフェースだけ揃えておく
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
    // 絶対パスが取れないため、ドロップされた中身を仮想 FS に取り込んでからその仮想パスを渡す。
    // Domain 層から見た形は Tauri 実装と同じになる。
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
   * ウィンドウ操作。ブラウザにはタブを最小化する概念も、閉じる権限も無い。
   * インタフェースだけ揃えて何もしない。
   * ここで `window.close()` を呼ぶような代替動作を実装すると、dev:web でタイトルバーを操作するたびに画面が閉じてしまう。
   */
  async minimizeWindow() {},

  async toggleMaximizeWindow() {},

  async closeWindow() {},

  // ブラウザのタブを勝手に増やさない。
  // `window.open` は多くの環境でポップアップとして遮断され、遮断されなかった場合は別の仮想 FS を持つ独立したアプリが立ち上がる。
  // どちらも `dev:web` で確かめたい内容ではない。
  async openSatellite() {
    console.info('[marxdown] openSatellite（ブラウザでは何も起きない）');
  },

  // 受け渡し箱はプロセス内の状態であり、ブラウザには移す先のウィンドウが無い。
  // 預けたものが誰にも引き取られないだけなので、インタフェースだけ揃えておく。
  async stashTransfer() {
    return 0;
  },

  async takeTransfer() {
    return null;
  },

  // ブラウザには渡す先のウィンドウが無い。
  // 失敗させるのは、成功扱いにすると呼び出し側が元のタブを閉じてしまうためである。
  async sendTabToWindow(target) {
    throw { kind: 'not-found', message: target };
  },

  onTabArrive() {
    return () => {};
  },

  // 窓の外にはブラウザのページを描けない。落とした先も常に「他のウィンドウではない」になる。
  async beginTabDrag() {},

  async moveTabDrag() {},

  async endTabDrag() {
    return null;
  },

  onTabDragOver() {
    return () => {};
  },

  // ブラウザにはトレイもプロセスも無い。
  // 無視せずログへ出力するのは、`dev:web` で「終了」を押したときに何も起きない理由が分かるようにするためである。
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

  // ブラウザには書き出し先も終了するプロセスも無いため、コンソールへ出力する。
  // `?benchInput` で経路そのものを確認するためのものであり、計測値は使わない。
  async benchInputDone(json) {
    console.info('[marxdown] benchInputDone', JSON.parse(json));
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
