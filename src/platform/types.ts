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

/** 表示モード（F-MODE-01〜03）。WYSIWYG は M4 で追加する。 */
export type ViewMode = 'preview' | 'edit' | 'split';

/**
 * 未保存のまま別の文書へ移るかの答え（`src-tauri/src/commands.rs` の `DiscardChoice`）。
 *
 * 綴りは Rust 側の serde に合わせる。
 * 同じ 3 語であることは `discard_choice_serializes_in_camel_case` が検証している。
 */
export type DiscardChoice = 'save' | 'discard' | 'cancel';

/** 02.architecture/04-rust-responsibilities.md §2 `DocumentPayload` のメタ部分。 */
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
 * 保存の要求（02.architecture/04-rust-responsibilities.md §3）。
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

/** 保存の結果。`conflict` は外部で変更されていたことを表す（02.architecture/04-rust-responsibilities.md §3）。 */
export type SaveResult =
  { status: 'saved'; mtimeMs: number; size: number } | { status: 'conflict'; diskMtimeMs: number };

/** `src-tauri/src/error.rs` の `CoreError` のシリアライズ形。 */
export interface CoreError {
  kind:
    | 'not-found'
    | 'permission-denied'
    | 'out-of-scope'
    | 'too-large'
    | 'conflict'
    | 'invalid-argument'
    | 'settings-broken'
    | 'io';
  message: string;
  /**
   * 検証済みの解決先。`out-of-scope` のときだけ入る（OQ-17）。
   *
   * symlink を解決した後のパスであり、ドキュメントに書かれた文字列ではない。
   * 何を許可しようとしているのかを見せるには、解決後のほうでなければ意味がない。
   */
  path?: string | null;
}

/** ペイン 1 枚の状態（`src-tauri/src/store.rs` の `PaneState`）。 */
export interface PaneState {
  open: boolean;
  /** 幅（CSS ピクセル）。左右で別々に記録する（03.ux-spec/06-panes.md §3）。 */
  width: number;
}

/**
 * 左右のペイン（`src-tauri/src/store.rs` の `Panes`）。
 *
 * `left`（Explorer）は M3 で導入するが、構造だけ先に用意してある。
 * 後から追加すると、どちらの幅か判別できない 1 つの値が先に永続化される。
 */
export interface Panes {
  left: PaneState;
  right: PaneState;
}

/**
 * 記録が無いときの状態。左右とも閉じている（03.ux-spec/06-panes.md §3 の引用ブロック）。
 * `src-tauri/src/store.rs` の `PaneState::default()` と 1:1 で対応する。
 */
export const DEFAULT_PANES: Panes = {
  left: { open: false, width: 240 },
  right: { open: false, width: 240 },
};

/**
 * Split の既定の分割比と可動域（03.ux-spec/03-split-mode.md §1）。
 * `src-tauri/src/store.rs` の `SPLIT_*` と 1:1 で対応する。
 *
 * 端まで寄せて片方の領域を失わないようにする。
 * 片方が失われると Split である意味が無くなり、元に戻すための操作対象も同時に消える。
 */
export const SPLIT_DEFAULT = 0.5;
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

/**
 * `settings.json` を読めなかった事実（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * これがある間、アプリは既定値で動作するがファイルを上書きしない。
 * ユーザーが手で書いたファイルであるためである（02.architecture/04-rust-responsibilities.md §5）。
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

/**
 * カスタム CSS を適用できなかった理由（`src-tauri/src/custom_css.rs`）。
 *
 * ファイルが無い状態はここに現れない。
 * ファイルが無いのは正常な状態であり（設定項目を置かない以上、初回起動が常にこれにあたる）、通知の対象にしない。
 */
export interface CustomCssProblem {
  kind: 'too-large' | 'unreadable';
  path: string;
  message: string;
}

/** `custom.css` の読み込み結果（`src-tauri/src/custom_css.rs` の `CustomCss`）。 */
export interface CustomCss {
  /** 読み込んだ CSS。`null` は「無い」か「読まなかった」。 */
  css: string | null;
  /**
   * 64KB を超えたため bootstrap に載らなかった。
   * `ready()` の後に `readCustomCss` で取りに行く（02.architecture/10-theming.md §3）。
   */
  deferred: boolean;
  problem: CustomCssProblem | null;
}

/** カスタム CSS が無い状態。bootstrap を持たない経路（テスト / dev:web）の既定値。 */
export const NO_CUSTOM_CSS: CustomCss = { css: null, deferred: false, problem: null };

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
  document: BootstrapDocument | null;
  documentError: BootstrapError | null;
  mode: ViewMode | null;
  /**
   * 入力レスポンスの計測を走らせるか（`--bench-input` / 計測専用）。
   *
   * 指定されていると `ready()` の後に `features/bench/input.ts`（遅延チャンク）が動作し、打鍵を合成して結果を `benchInputDone` へ渡す。
   * 書き出し先はここに載せない（任意のパスへ書き込める経路を作らないため）。
   */
  benchInput: boolean;
  trace: TraceConfig | null;
  pendingPaths: string[];
  /**
   * 復元するタブ（OQ-04 / M3 Phase 7）。**タブの並び順**である。
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
   * ペインの開閉と幅（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
   *
   * 倍率と同じ理由でここに載せる。
   * 後から適用すると、本文が一度全幅で描画された後に幅が縮小して見える（02.architecture/04-rust-responsibilities.md §5）。
   */
  panes: Panes;
  /**
   * Split の分割比（エディター側の取り分 / 03.ux-spec/03-split-mode.md §1）。
   *
   * 倍率やペインと同じ理由でここに載せる。
   * 後から適用すると、Split で開いたときに 50:50 の状態が一度描画された後に分割比が変化して見える。
   */
  split: number;
  /**
   * ユーザー設定の全体（02.architecture/04-rust-responsibilities.md §5）。
   *
   * どの設定が初回フレームに間に合う必要があるかを都度判断せずに済むよう、選別せずすべて載せる。
   * 取得する経路（IPC 往復）は作らない。
   */
  settings: Settings;
  /** `settings.json` を読めなかった事実。通知バーに出す（03.ux-spec/07-status-and-notifications.md §2）。 */
  settingsError: SettingsProblem | null;
  /**
   * カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）。
   *
   * 64KB 以下のときだけ `css` が入る。
   * ここに載せるのは、暗い背景を指定しているときに白い初期画面が一瞬表示されるのを防ぐためである。
   * 超えている場合は `deferred` が立ち、`readCustomCss` で取得する。
   */
  customCss: CustomCss;
  /**
   * エディター用のカスタム CSS（`editor.css` / ADR-0013）。本文用と同じ扱いである。
   * 別のフィールドにしているのは、適用先（`@scope` の起点）が違うためである。
   */
  editorCss: CustomCss;
}

/** 別インスタンスから転送された起動要求（ウォーム起動）。 */
export interface OpenRequest {
  /** この要求の計測 ID。描画完了後に `warmDone` へ返す（S6）。 */
  requestId: number;
  paths: string[];
  newWindow: boolean;
  mode: ViewMode | null;
  trace: boolean;
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
  /** ウィンドウの上にファイルが来ている。ドロップ先の見た目を出す。 */
  | { type: 'over' }
  | { type: 'drop'; paths: string[] }
  /** 外へ出た / 取り消された。 */
  | { type: 'leave' };

/**
 * ウォーム経路の種別（ADR-0007「Warm Start の計測経路が 2 本になる」）。
 *
 * 記録を分けるためだけに存在する。2 つを混ぜて集計しない。
 */
export type WarmKind = 'warm' | 'tray-resume';

/**
 * Platform 層のインタフェース。
 *
 * Domain 層はこれだけを参照する。
 * Tauri に依存しないことで、Vitest 上でも `dev:web` のブラウザ上でも同じコードが動作する（02.architecture/03-layers.md §1）。
 */
export interface Platform {
  readonly kind: 'tauri' | 'web';
  /** 同期的に読める初期ペイロード。IPC 往復を挟まないことが最重要。 */
  getBootstrap(): Bootstrap | null;
  /**
   * ファイルを読む。
   *
   * `encoding` はエンコーディングの指定である（03.ux-spec/07-status-and-notifications.md §3「クリックでエンコーディング再解釈」）。
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
   * 無題の文書には基点が無いため、呼ぶ側が手前で断ること。
   */
  writeAsset(documentPath: string, extension: string, data: Uint8Array): Promise<string>;
  /**
   * スコープ外の画像を 1 件だけ許可する（OQ-17 / ADR-0006）。
   *
   * 許可されるのは**その画像があるディレクトリ 1 つだけ**で、配下へは広がらない。
   * アプリを終了すれば消える。利用者がプレースホルダのボタンを押したときにだけ呼ぶこと。
   */
  allowImageDir(href: string, baseDir: string): Promise<string>;
  /**
   * ディレクトリの中身を 1 階層ぶん返す（F-NAV-03 / ファイルツリー）。
   *
   * 隠しファイル・`node_modules` は Rust 側で落ちてくる（`src-tauri/src/dir.rs`）。
   * 再帰しないのは、開いたディレクトリだけを読む遅延展開のためである（03.ux-spec/06-panes.md §1）。
   */
  listDir(path: string): Promise<DirEntry[]>;
  /**
   * 基点の配下の Markdown を再帰的に集める（F-NAV-05 / クイックオープン）。
   *
   * 対象の拡張子は Platform 層が `lib/path.ts` から渡す。件数と深さには上限があり、
   * 超えたときは `truncated` が立つ（`src-tauri/src/dir.rs`）。
   */
  listFiles(root: string): Promise<FileList>;
  /**
   * 開いているタブを覚える（OQ-04）。**引数なしで起動したときだけ復元される。**
   *
   * 覚えるのはパスと表示中の位置だけで、本文は持たない。
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
   * ペインの開閉と幅を永続化する（03.ux-spec/06-panes.md §3）。
   *
   * 倍率と同じく、反映は呼び出し側が即座に行う。
   * ここは保存だけを担当するため、ドラッグ中に毎フレーム呼ばず、デバウンスしてから呼ぶこと。
   */
  setPanes(panes: Panes): Promise<void>;
  /**
   * Split の分割比を保存する（03.ux-spec/03-split-mode.md §1）。
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
   * 保存先を選ばせる（F-EDIT-02「名前を付けて保存」）。
   *
   * `suggested` は初期表示するディレクトリとファイル名の元になる値である。
   * 返るパスは正規化されていない。保存先はまだ存在しないことがあるためである（`src-tauri/src/commands.rs` の `pick_save_path`）。
   * 正規化は保存時に行われる。
   */
  pickSavePath(suggested: string | null): Promise<string | null>;
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
   * `settings.json` が読めない状態では拒否される（02.architecture/04-rust-responsibilities.md §5）。
   */
  writeSettings(patch: SettingsPatch): Promise<Settings>;
  /**
   * `settings.json` を OS の既定アプリで開く（F-CONF-06）。
   * 壊れた設定を通知バーから修正できるようにするための経路である。
   */
  openSettingsFile(): Promise<void>;
  /**
   * カスタム CSS を読み直す（F-CONF-07 / 02.architecture/10-theming.md §3）。
   *
   * 起動時の 64KB 以下はこれを呼ばない。bootstrap に同梱されている。
   * このメソッドが必要になるのは、64KB を超えて同梱されなかった場合と、外部エディターで編集された後の読み直しだけである。
   */
  readCustomCss(): Promise<CustomCss>;

  /** `editor.css` を読み直す。`readCustomCss` と対になる。 */
  readEditorCss(): Promise<CustomCss>;
  /**
   * `custom.css` を OS の既定アプリで開く（F-CONF-07）。
   *
   * 無ければ雛形を作ってから開く。
   * 設定項目もパスの設定も置かない以上、どこに書けばよいかを知る手段がこのボタンしかない。
   */
  openCustomCssFile(): Promise<void>;

  /** `editor.css` を既定のアプリで開く。無ければ雛形を作ってから開く。 */
  openEditorCssFile(): Promise<void>;
  /**
   * `custom.css` の外部変更を購読する（02.architecture/10-theming.md §3）。
   *
   * `onSettingsChanged` と同じく中身は渡さない。受け取ったら
   * `readCustomCss` で読み直して当て直すのが唯一の使い方。
   */
  onCustomCssChanged(handler: () => void): () => void;

  /** `editor.css` の外部変更。本文用とは別のイベントで、片方だけを読み直す。 */
  onEditorCssChanged(handler: () => void): () => void;
  /**
   * 開いているファイルの監視を始める（F-EDIT-16 / 02.architecture/04-rust-responsibilities.md §4）。
   *
   * 監視するのは開いているファイルだけである（N-PERF-05）。
   * 呼ぶたびに前のファイルの監視は解除される（タブが入る M3 までは対象が 1 つしかない）。
   */
  watchPath(path: string): Promise<void>;
  /** 監視をやめる。タブを閉じたとき（M3）に呼ぶ。 */
  unwatchPath(path: string): Promise<void>;
  /** 監視しているファイルの外部変更を購読する。 */
  onFileChanged(handler: (change: FileChange) => void): () => void;
  /**
   * `settings.json` の外部変更を購読する（02.architecture/04-rust-responsibilities.md §5）。
   *
   * 中身は渡さない。
   * 受け取ったら `readSettings` で読み直して全体を適用し直すことが唯一の使い方であり、差分を渡す必要がない（設定は小さい）。
   */
  onSettingsChanged(handler: () => void): () => void;
  /** ウィンドウへのドラッグ＆ドロップを購読する（F-OPEN-08）。 */
  onDragDrop(handler: (event: DragDropEvent) => void): () => void;
  /**
   * ウィンドウ操作（カスタムタイトルバー / 03.ux-spec/01-screen-layout.md §1）。
   *
   * `decorations: false` にしているため、`─ □ ✕` は自前の `<button>` である。
   * 実体は Rust 側の自作コマンドで、JS の `@tauri-apps/api/window` は導入していない（04.tech-stack/06-rust.md §2 と同じ判断）。
   *
   * ドラッグとダブルクリックによる最大化はここには無い。
   * Tauri 本体が注入する `data-tauri-drag-region` の処理が担当し、フロントは属性を指定するだけである。
   */
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  /**
   * 閉じる。
   *
   * 既定ではトレイに格納され、プロセスは終了しない（ADR-0007 論点 2 / 設定 `window.closeBehavior`）。
   * 判断は Rust 側の `close.rs` が持ち、フロントは閉じる要求だけを送る。
   * ここで分岐を持つと、`Alt+F4` と OS 由来の閉じる要求だけ挙動が変わる。
   */
  closeWindow(): Promise<void>;
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
   * ウォーム起動の完了報告（S6）。argv 転送を受けてから本文が読める状態になるまでの経過ミリ秒を返す。
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
   * トレイから復帰した瞬間を購読する（ADR-0007「計測項目」）。
   *
   * Warm Start とは別の経路である。
   * Warm Start はウィンドウが可視のまま argv 転送を受けた場合の値（実測 20.0ms）で、こちらはサスペンドされた WebView が復帰して表示されるまでを測る。
   * 同じ指標として比較すると判断を誤る。
   *
   * 受け取ったら次の rAF で `warmDone(id, ..., 'tray-resume')` を呼ぶ。
   */
  onTrayResume(handler: (requestId: number) => void): () => void;
  openExternal(url: string): Promise<void>;
  /**
   * Markdown 以外のローカルファイルを OS の既定アプリで開く（F-VIEW-06）。
   * 許可ディレクトリの外は Rust 側で拒まれる。
   */
  openLocalFile(path: string): Promise<void>;
  revealInFileManager(path: string): Promise<void>;
  onOpenRequest(handler: (req: OpenRequest) => void): () => void;
}
