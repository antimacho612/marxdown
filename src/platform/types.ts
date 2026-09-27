/**
 * Platform 層の型。Rust 側（`src-tauri/src/`）の serde 定義と 1:1 で対応する。
 *
 * ここが唯一の対応表なので、Rust 側を変えたらここも必ず変える。
 * ユーザー設定だけは `settings-schema.ts` に分けてある。
 * キー・既定値・選択肢・許容範囲が 1 つの表から導出される形になっており、型だけをここへ写すと表が 2 枚になる。
 */
import type { Settings, SettingsPatch } from './settings-schema';

/** 改行コード。メモリ上は常に LF で、ディスクへの書き出し時にこの値へ戻す（N-CMP-03）。 */
export type Eol = 'lf' | 'crlf';

/** 扱えるエンコーディング。`src-tauri/src/document/encoding.rs` の `Encoding` と対応する。 */
export type Encoding = 'utf8' | 'utf16-le' | 'utf16-be' | 'shift-jis' | 'euc-jp';

/** 表示モード（F-MODE-01〜03）。WYSIWYG（F-MODE-04）は未実装である。 */
export type ViewMode = 'preview' | 'edit' | 'split';

/**
 * ウィンドウの役割（F-OPEN-06）。`src-tauri/src/bootstrap.rs` の `WindowRole` と対応する。
 *
 * `main` はフルシェルのウィンドウで、1 プロセスに 1 枚しか無い。
 * `satellite` はタブと本文だけを持つウィンドウで、ファイルツリー・アウトライン・ハンバーガーメニューを持たない。
 */
export type WindowRole = 'main' | 'satellite';

/**
 * 未保存のまま別の文書へ移るかの答え（`src-tauri/src/commands.rs` の `DiscardChoice`）。
 *
 * 綴りは Rust 側の serde に合わせる。
 * 同じ 3 語であることは `discard_choice_serializes_in_camel_case` が検証している。
 */
export type DiscardChoice = 'save' | 'discard' | 'cancel';

/** `DocumentPayload` のメタ部分。 */
export interface DocumentMeta {
  /** 正規化済み絶対パス */
  path: string;
  eol: Eol;
  bom: boolean;
  encoding: Encoding;
  mtimeMs: number;
  size: number;
  readonly: boolean;
}

/** ディレクトリの中の 1 件（F-NAV-03）。 */
export interface DirEntry {
  name: string;
  /** 正規化済み絶対パス。そのまま `readDocument` へ渡せる。 */
  path: string;
  dir: boolean;
}

/**
 * ツリーの 1 件（`src-tauri/src/dir.rs` の `TreeNode`）。
 *
 * 入れ子のまま受け取る。罫線を組むには木の形が要る。
 */
export interface TreeNode {
  name: string;
  dir: boolean;
  /** ディレクトリ以外では常に空。 */
  children: TreeNode[];
}

/** 基点とその配下（`src-tauri/src/dir.rs` の `DirTree`）。 */
export interface DirTree {
  /** 基点の表示名。パスではない。 */
  name: string;
  nodes: TreeNode[];
  /** 上限で打ち切ったか。true なら木は全体の一部である。 */
  truncated: boolean;
}

/** 移動・リネームの結果（`src-tauri/src/fsops.rs` の `Moved`）。どちらも絶対パス。 */
export interface Moved {
  from: string;
  to: string;
}

/**
 * ファイルツリーでの移動・リネーム（`marxdown://entries-moved`）。全ウィンドウに届く。
 *
 * 最近開いたファイルは Rust 側で付け替え済みで、更新後の一覧が `recent` に入っている。
 */
export interface EntriesMoved {
  moves: Moved[];
  recent: RecentEntry[];
}

/** ファイルツリーでゴミ箱へ移した項目（`marxdown://entries-removed`）。全ウィンドウに届く。 */
export interface EntriesRemoved {
  paths: string[];
  recent: RecentEntry[];
}

/** クイックオープンの候補（F-NAV-05）。 */
export interface FileList {
  /** 正規化済み絶対パス。パス順に並んでいる。 */
  files: string[];
  /** 上限で打ち切ったか。true なら候補は全体の一部である。 */
  truncated: boolean;
}

/** メタ情報と本文の組。`readDocument` と bootstrap が返す。 */
export interface DocumentPayload extends DocumentMeta {
  /** EOL を LF に正規化した本文 */
  content: string;
}

/**
 * 保存の要求。
 * `eol` / `bom` / `encoding` は読み込み時の値をそのまま返し、触っていない箇所のバイト列を変えない（N-CMP-03）。
 */
export interface WriteRequest {
  path: string;
  content: string;
  eol: Eol;
  bom: boolean;
  encoding: Encoding;
  /** `null` は新規ファイル。既存ファイルがあれば衝突扱いになる。 */
  expectedMtimeMs: number | null;
}

/** 保存の結果。`conflict` は外部で変更されていたことを表す。 */
export type SaveResult =
  { status: 'saved'; mtimeMs: number; size: number } | { status: 'conflict'; diskMtimeMs: number };

/** `src-tauri/src/error.rs` の `CoreError` のシリアライズ形。 */
export interface CoreError {
  kind:
    | 'not-found'
    | 'permission-denied'
    | 'out-of-scope'
    | 'too-large'
    | 'binary'
    | 'conflict'
    | 'already-exists'
    | 'invalid-argument'
    | 'settings-broken'
    | 'io';
  message: string;
  /**
   * 検証済みの解決先。`out-of-scope` のときだけ入る。
   *
   * symlink を解決した後のパスであり、ドキュメントに書かれた文字列ではない。
   * 何を許可しようとしているのかを示すには、解決後のパスでなければならない。
   */
  path?: string | null;
}

/** ペイン 1 枚の状態（`src-tauri/src/store.rs` の `PaneState`）。 */
export interface PaneState {
  open: boolean;
  /** 幅（CSS ピクセル）。左右で別々に記録する。 */
  width: number;
}

/**
 * 左右のペイン（`src-tauri/src/store.rs` の `Panes`）。幅は左右で別々に記録する。
 */
export interface Panes {
  left: PaneState;
  right: PaneState;
}

/**
 * 記録が無いときの状態。左右とも閉じている。
 * `src-tauri/src/store.rs` の `PaneState::default()` と 1:1 で対応する。
 */
export const DEFAULT_PANES: Panes = {
  left: { open: false, width: 240 },
  right: { open: false, width: 240 },
};

/**
 * Split の既定の分割比と可動域。
 * `src-tauri/src/store.rs` の `SPLIT_*` と 1:1 で対応する。
 *
 * 端まで動かして片方の領域を失わないようにする。
 * 片方が失われると Split である意味が無くなり、元に戻すための操作対象も同時に消える。
 */
export const SPLIT_DEFAULT = 0.5;
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

/**
 * `settings.json` を読めなかった事実。
 *
 * これがある間、アプリは既定値で動作するがファイルを上書きしない。
 * ユーザーが手で書いたファイルであるためである。
 */
export interface SettingsProblem {
  path: string;
  message: string;
}

/** 設定の読み込み結果。`broken` がある間は書き戻しが拒否される。 */
export interface SettingsLoad {
  values: Settings;
  broken: SettingsProblem | null;
}

/** Marp の自作テーマを読めなかった理由（`src-tauri/src/marp_themes.rs` の `ProblemKind`）。 */
export type MarpThemeProblemKind = 'not-absolute' | 'missing' | 'not-css' | 'too-large' | 'too-many' | 'unreadable';

/** 設定 `marp.themes` から読んだ Marp の自作テーマ（`src-tauri/src/marp_themes.rs` の `MarpThemes`）。 */
export interface MarpThemes {
  themes: { path: string; css: string }[];
  problems: { path: string; kind: MarpThemeProblemKind }[];
}

/**
 * ユーザーが `themes/` に置いた配色（`src-tauri/src/themes.rs` の `UserTheme`）。
 *
 * 組み込みの配色と同じ形でカタログに載り、プレビューとエディターのどちらからも選べる。
 * 同じ id が組み込みにもある場合はこちらが優先される。
 */
export interface UserTheme {
  /** 拡張子を除いたファイル名。そのまま `preview.theme` / `editor.theme` の値になる。 */
  id: string;
  /**
   * ファイルの中身。宣言の並びであることは前提にしない。
   * 包んだ結果が面の外へ出ていないかは `features/theme/inject.ts` がブラウザの CSS パーサで検査する。
   */
  declarations: string;
}

/**
 * 外部で何が起きたか。
 *
 * `removed` を分けているのは、削除されたファイルを読みに行かせないためである。
 * 読みに行くと「開けません」が表示され、作り直された時点でもう一度表示される。
 */
export type FileChangeKind = 'modified' | 'removed';

/** `marxdown://file-changed` の中身（`src-tauri/src/watch.rs` の `FileChange`）。 */
export interface FileChange {
  /** 正規化済み絶対パス。開いているファイルかどうかはこれで照合する。 */
  path: string;
  /** 消えている場合は 0。 */
  mtimeMs: number;
  kind: FileChangeKind;
}

/** 起動計測の設定。無効なときも渡り、フロントは `enabled` で判断する。 */
export interface TraceConfig {
  enabled: boolean;
  /** T0 時点の UNIX epoch ミリ秒。performance.timeOrigin をこの軸に載せ替える。 */
  t0EpochMs: number;
}

/** 起動時に開く 1 枚目のドキュメント。 */
export interface BootstrapDocument extends DocumentMeta {
  /** 256KB を超えるファイルでは `null`。`readDocument` で取りに行く。 */
  content: string | null;
}

/** 初期ドキュメントを読めなかった理由。通知バーに出す。 */
export interface BootstrapError {
  path: string;
  kind: CoreError['kind'];
  message: string;
}

/** 最近開いたファイル（F-OPEN-09）。`src-tauri/src/store.rs` の `RecentEntry`。 */
export interface RecentEntry {
  /** 正規化済み絶対パス。表示用の分割は `splitPath` で行う。 */
  path: string;
  openedAtMs: number;
}

/** `window.__MARXDOWN_BOOTSTRAP__` の中身。 */
export interface Bootstrap {
  version: number;
  /** このウィンドウの役割（F-OPEN-06）。シェルの描き分けと、前回のタブを覚えるかどうかが変わる。 */
  role: WindowRole;
  /**
   * 引き取るべき本文の ID（F-OPEN-06）。未保存のタブをサテライトへ移したときだけ入る。
   *
   * `takeTransfer(id)` で 1 回だけ取りに行き、その内容で文書を開く。
   * 本文そのものは bootstrap に載らない（大きな文書が初期化スクリプトへ丸ごと書き出されるのを避けるため）。
   */
  transfer: number | null;
  document: BootstrapDocument | null;
  documentError: BootstrapError | null;
  mode: ViewMode | null;
  /**
   * 入力レスポンスを計測するか（`--bench-input` / 計測専用）。
   *
   * 指定されていると `ready()` の後に `features/bench/input.ts`（遅延チャンク）が動作し、打鍵を合成して結果を `benchInputDone` へ渡す。
   * 書き出し先はここに載せない（任意のパスへ書き込める経路を作らないため）。
   */
  benchInput: boolean;
  trace: TraceConfig | null;
  pendingPaths: string[];
  /**
   * 復元するタブ。タブの並び順である。
   *
   * 入るのは引数なしで起動したときだけである。
   * `document` には `sessionActive` が指すファイルが入っているので、それ以外を元の位置へ開き直す。
   */
  session: string[];
  /** `session` の中で表示していたタブの位置。 */
  sessionActive: number;
  /**
   * ファイルツリーの基点（F-OPEN-02 / `marxdown <dir>`）。
   *
   * ディレクトリを指定して起動したときだけ入る。
   * 無ければ開いているファイルの親ディレクトリが基点になる（`features/workspace/Explorer.svelte`）。
   */
  workspaceRoot: string | null;
  unknownArgs: string[];
  /** Welcome 画面が起動直後に描画するため、IPC 往復ではなくここに載せる。 */
  recent: RecentEntry[];
  /** 表示倍率（F-VIEW-11）。最初のフレームから正しい倍率で描画するために必要になる。 */
  zoom: number;
  /**
   * ペインの開閉と幅（F-NAV-04）。
   *
   * 倍率と同じ理由でここに載せる。
   * 後から適用すると、本文が一度全幅で描画された後に幅が縮小して見える。
   */
  panes: Panes;
  /**
   * Split の分割比（エディター側の取り分）。
   *
   * 倍率やペインと同じ理由でここに載せる。
   * 後から適用すると、Split で開いたときに 50:50 の状態が一度描画された後に分割比が変化して見える。
   */
  split: number;
  /**
   * ユーザー設定の全体。
   *
   * どの設定が初回フレームに間に合う必要があるかを都度判断せずに済むよう、選別せずすべて載せる。
   * 取得する経路（IPC 往復）は作らない。
   */
  settings: Settings;
  /** `settings.json` を読めなかった事実。通知バーに出す。 */
  settingsError: SettingsProblem | null;
  /**
   * プレビューで選ばれている `themes/` の 1 枚。
   *
   * 選択中の id に一致するファイルがあるときだけ入る。
   * 組み込みの配色を選んでいる場合と、存在しない綴りの場合は `null` で届く。
   *
   * ここに載せるのは、暗い配色を選んでいるときに既定の配色で初回フレームが描かれるのを防ぐためである。
   * 組み込みの 50 枚はフロント側の遅延チャンクにあり、そちらは `theme` チャンクの取得を待って適用される。
   */
  previewTheme: UserTheme | null;
}

/** 別インスタンスから転送された起動要求（ウォーム起動）。 */
export interface OpenRequest {
  /** この要求の計測 ID。描画完了後に `warmDone` へ返す。 */
  requestId: number;
  paths: string[];
  mode: ViewMode | null;
  trace: boolean;
}

/** 主ウィンドウのラベル（`src-tauri/src/window.rs` の `MAIN_LABEL`）。プロセスごとに 1 枚だけある。 */
export const MAIN_WINDOW = 'main';

/**
 * 別のウィンドウから移されてきたタブ（OQ-43）。
 *
 * どちらか一方だけが入る。
 * ディスクと一致しているタブは `paths`、未保存か無題のタブは受け渡し箱の ID（`transfer`）で届く（ADR-0016 §3.4）。
 */
export interface TabArrival {
  paths: string[];
  transfer: number | null;
}

/** 色 1 つ（sRGB の 0〜255）。 */
export type Rgb = [number, number, number];

/** タブを窓の外へドラッグしている間、カーソルに追従する表示の中身。 */
export interface TabDragGhost {
  /** タブの名前。 */
  label: string;
  colors: { background: Rgb; foreground: Rgb; border: Rgb };
}

/** 計測点 1 つ。`atMs` は T0 からの経過ミリ秒。 */
export interface TraceMark {
  id: string;
  atMs: number;
  note?: string;
}

/**
 * ウィンドウへのドラッグ＆ドロップ（F-OPEN-08）。
 *
 * ブラウザの `DataTransfer` ではなく OS 側のイベントを使う。
 * WebView はドロップされたファイルの絶対パスを JS へ渡さないため、`DataTransfer` からでは最近開いたファイルに追加できず、相対パスの画像も解決できない（F-VIEW-08 / N-SEC-05）。
 */
export type DragDropEvent =
  /**
   * ウィンドウの上にファイルが来ている。ドロップ先の見た目を出す。
   *
   * 位置は CSS ピクセルのビューポート座標で、`document.elementFromPoint` にそのまま渡せる（F-NAV-13）。
   */
  | { type: 'over'; x: number; y: number }
  | { type: 'drop'; paths: string[]; x: number; y: number }
  /** 外へ出た / 取り消された。 */
  | { type: 'leave' };

/**
 * ウォーム経路の種別（ADR-0007「Warm Start の計測経路が 2 本になる」）。
 *
 * 記録を分けるためだけに存在する。2 つを混ぜて集計しない。
 */
export type WarmKind = 'warm' | 'tray-resume';

/** 公開されている新しい版（ADR-0024）。 */
export interface UpdateInfo {
  version: string;
  /** 変更内容を読める Release のページ。 */
  notesUrl: string;
}

/**
 * `installUpdate` が更新を始めなかった理由。
 *
 * `dirty` は未保存の変更がある（ADR-0024 §3.6）。
 * `up-to-date` は確認し直したら新しい版が無かった。
 */
export type InstallRefusal = 'dirty' | 'up-to-date';

/** アプリ自身の情報（「Marxdown について」と不具合の報告 / F-OS-09）。 */
export interface AppInfo {
  version: string;
  /** OS の名前と版（`Windows 11 24H2 (26100.4061)` の形）。 */
  os: string;
  /** WebView2 の版。取れなければ `null`。 */
  webview: string | null;
}

/**
 * インストーラに同梱したライセンス文の種類。
 *
 * パスではなく種類で指定する。任意のファイルを既定アプリで開く経路を作らないため（ADR-0006）。
 */
export type BundledFile = 'license' | 'thirdPartyNotices';

/**
 * Platform 層のインタフェース。
 *
 * Domain 層はこれだけを参照する。
 * Tauri に依存しないことで、Vitest 上でも `dev:web` のブラウザ上でも同じコードが動作する。
 */
export interface Platform {
  readonly kind: 'tauri' | 'web';
  /** 同期的に読める初期ペイロード。IPC 往復を挟まないことが最重要。 */
  getBootstrap(): Bootstrap | null;
  /**
   * ファイルを読む。
   *
   * `encoding` はエンコーディングの指定である。
   * 省略が通常の経路であり、そのときだけ Rust 側が推定を実行する。
   */
  readDocument(path: string, encoding?: Encoding): Promise<DocumentPayload>;
  writeDocument(req: WriteRequest): Promise<SaveResult>;
  /**
   * 相対パスの画像を、許可ディレクトリ配下であることを検証したうえで、`<img src>` にそのまま指定できる URL へ変換する（F-VIEW-08 / N-SEC-05）。
   */
  resolveAsset(href: string, baseDir: string): Promise<string>;
  /**
   * 貼り付けた画像を保存する（F-EDIT-13）。
   *
   * 保存先は `<ファイル名>.assets/` に固定で、こちらからは場所を渡さない（`src-tauri/src/asset.rs`）。
   * 返るのはドキュメントから見た相対パスで、そのまま `![](...)` に書ける形をしている。
   *
   * `documentPath` は開いているファイルの絶対パスである。
   * 無題の文書には基点が無いため、呼ぶ側が手前で拒否すること。
   */
  writeAsset(documentPath: string, extension: string, data: Uint8Array): Promise<string>;
  /**
   * スコープ外の画像を 1 件だけ許可する（ADR-0006）。
   *
   * 許可されるのはその画像があるディレクトリ 1 つだけで、配下へは広がらない。
   * アプリを終了すれば消える。利用者がプレースホルダのボタンを押したときにだけ呼ぶこと。
   */
  allowImageDir(href: string, baseDir: string): Promise<string>;
  /**
   * ディレクトリの中身を 1 階層ぶん返す（F-NAV-03 / ファイルツリー）。
   *
   * 隠しファイル・`node_modules`・`explorer.exclude` の glob は Rust 側で除外されて届く（`src-tauri/src/dir.rs`）。
   * 再帰しないのは、開いたディレクトリだけを読む遅延展開のためである。
   *
   * `root` は木の基点。`explorer.exclude` の glob をどこからの相対として解釈するかだけに使う。
   * 読む範囲を決めるのは `path` のほうであり、`root` は許可範囲を広げも狭めもしない。
   */
  listDir(path: string, root: string): Promise<DirEntry[]>;
  /**
   * 基点の配下の Markdown を再帰的に集める（F-NAV-05 / クイックオープン）。
   *
   * 対象の拡張子は Platform 層が `lib/path.ts` から渡す。件数と深さには上限があり、超えたときは `truncated` が立つ（`src-tauri/src/dir.rs`）。
   */
  listFiles(root: string): Promise<FileList>;
  /**
   * 指定したディレクトリの配下を木の形で返す（エクスプローラーの「ディレクトリ構造のコピー」）。
   *
   * 除外は `listDir` と同じで、深さと件数には上限がある（`src-tauri/src/dir.rs`）。
   * 1 階層ずつではなく 1 回で全体を返すのは、往復の回数が枝の数だけ増えるのを避けるためである。
   * `root` の意味は `listDir` と同じ。
   */
  listTree(path: string, root: string): Promise<DirTree>;
  /**
   * ファイルツリーで開いている枝を監視する（ADR-0021）。
   *
   * 渡した集合がそのまま監視の対象になり、含まれなくなった枝は解放される。空を渡せばすべて手放す。
   * 変化は `onDirChanged` で届く。
   */
  watchTree(dirs: string[]): Promise<void>;
  /** 監視している枝の中身が変わった。受け取ったらそのディレクトリを読み直す。 */
  onDirChanged(handler: (dir: string) => void): () => void;
  /**
   * 新しいファイルかフォルダを作る（F-NAV-11）。作ったパスを返す。
   *
   * 同じ名前が既にあれば `already-exists` で失敗する。上書きはしない。
   */
  createEntry(parent: string, name: string, dir: boolean): Promise<string>;
  /** 同じフォルダの中で名前を変える（F-NAV-11）。開いているタブへの反映は `onEntriesMoved` で届く。 */
  renameEntry(path: string, newName: string): Promise<Moved>;
  /**
   * フォルダの中へ移す（F-NAV-11 / F-NAV-12）。
   *
   * 途中で失敗しても、それまでに移した分は `onEntriesMoved` で届く。
   */
  moveEntries(paths: string[], dest: string): Promise<Moved[]>;
  /** フォルダの中へ複製する（F-NAV-11 / F-NAV-12）。同じ名前があれば `名前 copy` として置く。 */
  copyEntries(paths: string[], dest: string): Promise<string[]>;
  /**
   * ゴミ箱へ移す（ADR-0020 §3.3）。消えたパスを返す。
   *
   * 確認は呼び出し側が `confirmAction` で先に済ませること。
   * ゴミ箱に入らない項目は OS が完全に削除してよいかを尋ね、断られた項目は返り値に含まれない。
   */
  trashEntries(paths: string[]): Promise<string[]>;
  /**
   * 外部からドロップされた項目をフォルダへ複製する（F-NAV-13）。
   *
   * `paths` は直近の `onDragDrop` の `drop` で受け取ったものでなければならない。Rust 側が照合して、それ以外は拒む。
   */
  importDropped(paths: string[], dest: string): Promise<string[]>;
  /** 外部からドロップされたフォルダを、ファイルツリーの基点として許可する（F-NAV-13）。正規化済みのパスを返す。 */
  openDroppedFolder(path: string): Promise<string>;
  /** 移動・リネームを購読する。他のウィンドウで行った操作も届く。 */
  onEntriesMoved(handler: (event: EntriesMoved) => void): () => void;
  /** ゴミ箱へ移した項目を購読する。他のウィンドウで行った操作も届く。 */
  onEntriesRemoved(handler: (event: EntriesRemoved) => void): () => void;
  /**
   * 確認のダイアログを出す（ファイルツリーの削除・移動）。
   *
   * `confirm` は実行する側のボタンの文言である。既定は実行しない側で、閉じられた場合も `false` になる。
   */
  confirmAction(message: string, confirm: string): Promise<boolean>;
  /**
   * 開いているタブを覚える。引数なしで起動したときだけ復元される。
   *
   * 覚えるのはパスと表示中のタブだけで、本文は持たない。
   * パスを持たないタブ（`Ctrl+N`）は呼び出し側で除くこと。
   */
  setSession(paths: string[], active: number): Promise<void>;
  /** 最近開いたファイルに 1 件追加する。更新後の一覧を返す（F-OPEN-09）。 */
  pushRecent(path: string): Promise<RecentEntry[]>;
  /** 開けなくなったファイルを一覧から外す。更新後の一覧を返す。 */
  removeRecent(path: string): Promise<RecentEntry[]>;
  /**
   * 表示倍率を永続化する（F-VIEW-11）。
   * 反映は呼び出し側が即座に行う。ここは保存だけなので、デバウンスして呼ぶこと。
   */
  setZoom(zoom: number): Promise<void>;
  /**
   * ペインの開閉と幅を永続化する。
   *
   * 倍率と同じく、反映は呼び出し側が即座に行う。
   * ここは保存だけを担当するため、ドラッグ中に毎フレーム呼ばず、デバウンスしてから呼ぶこと。
   */
  setPanes(panes: Panes): Promise<void>;
  /**
   * Split の分割比を保存する。
   *
   * `setPanes` と同じくドラッグ中は呼ばず、離した時点で 1 回だけ呼ぶ。
   */
  setSplit(split: number): Promise<void>;
  /**
   * ファイル選択ダイアログを開く（F-OPEN-07）。
   * 選ばれなければ `null`。返るのは正規化済み絶対パス。
   */
  pickFile(): Promise<string | null>;
  /**
   * フォルダ選択ダイアログを開き、選ばれたフォルダをファイルツリーの基点として許可する（F-NAV-03）。
   *
   * 選ばれなければ `null`。返るのは正規化済み絶対パス。
   * 返ったパスをそのまま `listDir` に渡せる。`marxdown <dir>` で開いた場合と同じ許可範囲になる（N-SEC-05）。
   */
  pickFolder(): Promise<string | null>;
  /**
   * 保存先を選ばせる（F-EDIT-02「名前を付けて保存」）。
   *
   * `suggested` は初期表示するディレクトリとファイル名の元になる値である。
   * 返るパスは正規化されていない。保存先はまだ存在しないことがあるためである（`src-tauri/src/commands.rs` の `pick_save_path`）。
   * 正規化は保存時に行われる。
   */
  pickSavePath(suggested: string | null): Promise<string | null>;
  /**
   * HTML を書き出す（F-VIEW-18）。保存先はダイアログで選ばせ、書き込んだパスを返す。取り消されたら `null`。
   *
   * `suggested` は元の文書のパスで、同じ場所と同じ名前（拡張子だけ差し替える）を初期値にする。
   */
  exportHtml(html: string, suggested: string | null): Promise<string | null>;
  /**
   * 表示中のウィンドウを PDF に書き出す（F-VIEW-18）。何を印刷させるかは、呼ぶ前に `@media print` で整えておく。
   *
   * WebView2 の `PrintToPdf` を使うため、Windows 以外では `invalid-argument` で失敗する（`src-tauri/src/export.rs`）。
   */
  exportPdf(suggested: string | null): Promise<string | null>;
  /**
   * 表示中のローカル画像を data URI にする（HTML の書き出しで 1 ファイルに収めるため）。
   *
   * `src` は `resolveAsset` が返した URL である。
   * 読めるのはプレビューが表示を許可している範囲だけで、それ以外は失敗する。
   */
  inlineImage(src: string): Promise<string>;
  /**
   * 未保存の変更があることを知らせる（F-EDIT-03）。
   *
   * 変わり目だけ呼び、打鍵ごとには呼ばない。
   * Rust 側が値を持つのは、トレイメニューからの終了がフロントを経由しないためである（`src-tauri/src/state.rs` の `dirty`）。
   */
  setDirty(dirty: boolean): Promise<void>;
  /**
   * 未保存のまま別の文書へ移ってよいか尋ねる（F-EDIT-03 / N-REL-01）。
   *
   * 呼ぶかどうかは呼び出し側が決める。
   * ダーティでないときに呼ぶと、変更が無いのにダイアログが表示される（`features/document/discard.ts`）。
   *
   * 3 択であるため `boolean` では表せない。
   * `'save'` は保存してから移ることを表し、保存そのものはフロントが行う（本文は Monaco の `ITextModel` にある）。
   */
  confirmDiscard(): Promise<DiscardChoice>;
  /**
   * 設定を読み直す（F-CONF-03）。
   *
   * 起動時はこれを呼ばない。設定は bootstrap にすべて載っている。
   * このメソッドが必要になるのは、外部エディターで編集された後の読み直しと設定 UI の再表示である。
   */
  readSettings(): Promise<SettingsLoad>;
  /**
   * 変更したキーだけを書き戻す。更新後の設定全体を返す。
   * `settings.json` が読めない状態では拒否される。
   */
  writeSettings(patch: SettingsPatch): Promise<Settings>;
  /**
   * `settings.json` を OS の既定アプリで開く（F-CONF-06）。
   * 壊れた設定を通知バーから修正できるようにするための経路である。
   */
  openSettingsFile(): Promise<void>;
  /**
   * `themes/` に置かれた配色をすべて読む。
   *
   * 組み込みの 50 枚はフロント側の遅延チャンクにあり、これで返るのはユーザーが追加したものだけである。
   * 1 枚ずつ取りに行く形にしていないのは、呼び出し側（選択肢の一覧と適用）がどちらも全件を必要とするためである。
   */
  listUserThemes(): Promise<UserTheme[]>;

  /**
   * `themes/` をファイルマネージャで開く。
   *
   * 無ければ作り、書き方を説明する `README.css` を置いてから開く。
   * 設定項目もパスの設定も置かない以上、どこに何を書けばよいかを知る手段がこのボタンしかない。
   */
  openThemesDir(): Promise<void>;

  /**
   * `themes/` の中身の変更を購読する。
   *
   * `onSettingsChanged` と同じく中身は渡さない。受け取ったら `listUserThemes` で読み直して適用し直すのが唯一の使い方である。
   * どの 1 枚が変わったかも渡さない。選択中の配色が変わったかどうかは、読み直した結果と突き合わせないと判断できない。
   */
  onUserThemesChanged(handler: () => void): () => void;
  /**
   * Marp の自作テーマを読む（設定 `marp.themes` / ADR-0023 §3.4）。
   *
   * `paths` はファイルかフォルダーの絶対パスで、フォルダーは直下の `.css` を読む。
   * 読めなかったものは例外にせず `problems` に入れて返す。
   */
  readMarpThemes(paths: readonly string[]): Promise<MarpThemes>;
  /**
   * 表示中のファイルの監視を始める（F-EDIT-16）。
   *
   * 監視するのは表示中のファイル 1 つだけである（N-PERF-05）。
   * 呼ぶたびに前のファイルの監視は解除される。
   */
  watchPath(path: string): Promise<void>;
  /** 監視をやめる。タブを閉じたときに呼ぶ。 */
  unwatchPath(path: string): Promise<void>;
  /** 監視しているファイルの外部変更を購読する。 */
  onFileChanged(handler: (change: FileChange) => void): () => void;
  /**
   * `settings.json` の外部変更を購読する。
   *
   * 中身は渡さない。
   * 受け取ったら `readSettings` で読み直して全体を適用し直すことが唯一の使い方であり、差分を渡す必要がない（設定は小さい）。
   */
  onSettingsChanged(handler: () => void): () => void;
  /** ウィンドウへのドラッグ＆ドロップを購読する（F-OPEN-08）。 */
  onDragDrop(handler: (event: DragDropEvent) => void): () => void;
  /**
   * ウィンドウ操作（カスタムタイトルバー）。
   *
   * `decorations: false` であるため、`─ □ ✕` は自前の `<button>` である。
   * 実体は Rust 側の自作コマンドで、JS の `@tauri-apps/api/window` は導入していない（`@tauri-apps/plugin-dialog` を入れないのと同じ判断）。
   *
   * ドラッグとダブルクリックによる最大化はここには無い。
   * Tauri 本体が注入する `data-tauri-drag-region` の処理が担当し、フロントは属性を指定するだけである。
   */
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  /**
   * 閉じる。
   *
   * 既定ではトレイに格納され、プロセスは終了しない（ADR-0007 論点 2 / 設定 `window.closeToTray`）。
   * 判断は Rust 側の `close.rs` が持ち、フロントは閉じる要求だけを送る。
   * ここで分岐を持つと、`Alt+F4` と OS 由来の閉じる要求だけ挙動が変わる。
   */
  closeWindow(): Promise<void>;
  /**
   * サテライトウィンドウで開く（F-OPEN-06）。
   *
   * タブと本文だけを持つウィンドウを、同じプロセスの中に 1 枚増やす。
   * 2 つ以上渡すと、1 枚目が表示され残りはタブとして開かれる（起動時の `marxdown a.md b.md` と同じ扱い）。
   *
   * ウィンドウは WebView ごと作られるため、タブを増やすのとは桁の違うコストがかかる（ADR-0004 の Option C の欠点そのもの）。
   * 既定の導線はタブであり、これは明示的に選んだときだけ通る経路である。
   */
  openSatellite(options?: {
    paths?: string[];
    mode?: ViewMode;
    transfer?: number;
    /**
     * 出す位置（論理ピクセルのスクリーン座標）。タブを窓の外へドロップしたときだけ渡す。
     * 省略すると、元のウィンドウから少しずらした位置に出る。
     */
    position?: { x: number; y: number };
  }): Promise<void>;
  /**
   * サテライトへ移す本文を預ける（F-OPEN-06）。引き取りに使う ID を返す。
   *
   * 未保存のタブはパスだけでは渡せない。
   * `payload` は呼び出し側が組み立てた JSON 文字列で、Rust は中身を解釈せず運ぶだけである。
   *
   * 預かりものは 1 件しか無い。次の `stashTransfer` で置き換わる。
   */
  stashTransfer(payload: string): Promise<number>;
  /**
   * 預けた本文を引き取る。1 回しか取れない。
   *
   * 取れなかった場合（既に引き取り済み / ID の不一致）は `null` が返る。
   */
  takeTransfer(id: number): Promise<string | null>;
  /**
   * タブを既にあるウィンドウへ移す（OQ-43）。
   *
   * 渡すものはサテライトへ移すときと同じで、`paths` か `transfer` のどちらか一方である。
   * 渡す先が格納・最小化されていれば前面へ出してから届ける。
   *
   * 渡す先が無ければ失敗する。そのとき呼び出し側は元のタブを閉じてはいけない。
   */
  sendTabToWindow(target: string, handoff: { paths?: string[]; transfer?: number }): Promise<void>;
  /** 別のウィンドウから移されてきたタブを受け取る。このウィンドウ宛てのものだけが届く。 */
  onTabArrive(handler: (arrival: TabArrival) => void): () => void;
  /**
   * タブを窓の外へ引き出し始めた（OQ-43）。カーソルに追従する表示を出す。
   *
   * 表示できるのは Windows だけである。
   * 他の OS では何も出ないが、落とした先の判定（`endTabDrag`）は同じように使える。
   */
  beginTabDrag(ghost: TabDragGhost): Promise<void>;
  /** 窓の外でポインタが動いた。表示を追従させ、下にある他のウィンドウを強調させる。 */
  moveTabDrag(): Promise<void>;
  /**
   * 引き出すのを終えた。表示を消し、カーソルの下にある他の Marxdown のウィンドウのラベルを返す。
   *
   * 他のウィンドウの上でなければ `null` を返す。
   */
  endTabDrag(): Promise<string | null>;
  /**
   * 他のウィンドウで引き出されたタブが、このウィンドウの上に来た / 離れた。
   *
   * 引き出している側がポインタを捕捉しているため、このウィンドウにはポインタイベントが届かない。
   * 代わりに Rust がカーソルの位置から判定して知らせる。
   */
  onTabDragOver(handler: (over: boolean) => void): () => void;
  /**
   * Marxdown を終了する（ADR-0007 論点 3）。
   *
   * `closeWindow` とは別のメソッドである。
   * トレイ常駐では `✕` が格納の意味になるため、明示的に終了する経路が別に必要になる。
   * `Ctrl+Q` とハンバーガーメニューの「終了」がここへ来る（3 経路のうちの 2 つで、残り 1 つはトレイメニュー）。
   */
  quitApp(): Promise<void>;
  /**
   * トレイメニューの「Marxdown を開く」を購読する。
   *
   * Rust 側でダイアログを表示しない。
   * 開いた結果の扱い（履歴・通知・相対パスの解決）は `open.ts` に集約してあり、別経路で開くとそこだけ処理が抜ける。
   */
  onTrayOpen(handler: () => void): () => void;
  /** 最大化中か。購読を始めるときに 1 回だけ取得する。 */
  isWindowMaximized(): Promise<boolean>;
  /**
   * 最大化状態の変化を購読する。
   *
   * ボタン以外（`Win+↑` / ダブルクリック / 上端へのドラッグ）でも変化するため、操作した側で状態を持たず OS の状態を唯一の情報源とする。
   * Rust 側は変化したときだけ通知する。
   */
  onWindowMaximizedChanged(handler: (maximized: boolean) => void): () => void;
  /**
   * 最大化ボタンの居場所（CSS ピクセル）を知らせる（Windows の Snap Layouts）。
   *
   * `decorations: false` にすると Windows はボタンの位置を把握できず、ホバーしてもレイアウト選択のフライアウトが表示されない（`src-tauri/src/snap_layouts.rs`）。
   * 位置を知っているのはレイアウトを構成しているフロント側だけであるため、変化するたびに通知する。
   */
  setSnapLayoutsTarget(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  /**
   * 最大化ボタンのホバー（Windows の Snap Layouts）。
   *
   * フライアウトを表示するために非クライアント領域として応答しているため、その範囲には WebView のマウスイベントが届かない（CSS の `:hover` が動作しない）。
   * 最大化ボタンだけ反応しない状態を避けるため、Rust 側が出入りを通知する。
   */
  onMaximizeHoverChanged(handler: (hovered: boolean) => void): () => void;
  /** 描画準備完了。ウィンドウを表示させる。 */
  ready(): Promise<void>;
  reportTrace(marks: TraceMark[]): Promise<void>;
  /**
   * ウォーム起動の完了報告。argv 転送を受けてから本文が読める状態になるまでの経過ミリ秒を返す。
   */
  warmDone(requestId: number, path: string, detail: string, kind?: WarmKind): Promise<number | null>;
  /**
   * 入力レスポンス計測の結果を渡す（`--bench-input` / 計測専用）。
   *
   * 呼び出すとプロセスが終了する。
   * 書き出し先は Rust 側が保持しており（`bench_input_done`）、フロントはパスを知らない。
   */
  benchInputDone(json: string): Promise<void>;
  /**
   * 終了の確認で「保存して終了」が選ばれたことを購読する（F-EDIT-03）。
   *
   * 保存できるのはフロントだけである（本文は Monaco の `ITextModel` にある）。
   * 受け取ったら保存し、成功したらもう一度 `quitApp()` を呼ぶ。
   * 失敗した場合はダーティのままなので終了しない（N-REL-01）。
   */
  onSaveAndQuit(handler: () => void): () => void;
  /**
   * ウィンドウを閉じる確認で「保存して閉じる」が選ばれたことを購読する（F-OPEN-06）。
   *
   * `onSaveAndQuit` と同じ構造で、保存した後の行き先だけが違う。
   * 受け取ったら保存し、成功したらもう一度 `closeWindow()` を呼ぶ。
   */
  onSaveAndClose(handler: () => void): () => void;
  /**
   * トレイから復帰した瞬間を購読する（ADR-0007「計測項目」）。
   *
   * Warm Start とは別の経路である。
   * Warm Start はウィンドウが可視のまま argv 転送を受けた場合の値で、こちらはサスペンドされた WebView が復帰して表示されるまでを測る。
   * 同じ指標として比較すると判断を誤る。
   *
   * 受け取ったら次の rAF で `warmDone(id, ..., 'tray-resume')` を呼ぶ。
   */
  onTrayResume(handler: (requestId: number) => void): () => void;
  openExternal(url: string): Promise<void>;
  /**
   * 新しい版を問い合わせる（コマンドパレットの「更新を確認」 / ADR-0024）。
   *
   * 設定 `update.autoCheck` と確認の間隔には関係なく、常に問い合わせる。
   */
  checkUpdate(): Promise<UpdateInfo | null>;
  /**
   * 見つけた更新をダウンロードして適用する（ADR-0024 §3.6）。
   *
   * Windows では更新を始めた時点でプロセスが終わり、Promise は解決しない。
   * 解決するのは更新を始めなかったときだけである。
   */
  installUpdate(): Promise<InstallRefusal>;
  /**
   * 自動の確認で新しい版が見つかったことを購読する。
   *
   * 確認の契機と間隔は Rust 側が決める（`src-tauri/src/update.rs`）。
   */
  onUpdateAvailable(handler: (info: UpdateInfo) => void): () => void;
  /** Marxdown のバージョン・OS・WebView2 の版を返す（F-OS-09）。 */
  appInfo(): Promise<AppInfo>;
  /** 同梱したライセンス文を OS の既定アプリで開く（F-OS-09）。 */
  openBundledFile(file: BundledFile): Promise<void>;
  /**
   * Markdown 以外のローカルファイルを OS の既定アプリで開く（F-VIEW-06）。
   * 許可ディレクトリの外は Rust 側で拒まれる。
   */
  openLocalFile(path: string): Promise<void>;
  revealInFileManager(path: string): Promise<void>;
  onOpenRequest(handler: (req: OpenRequest) => void): () => void;
}
