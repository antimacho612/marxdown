/**
 * Platform 層の型。Rust 側（`src-tauri/src/`）の serde 定義と 1:1 で対応する。
 *
 * ここが唯一の対応表なので、Rust 側を変えたらここも必ず変える。
 * ユーザー設定だけは `settings-schema.ts` に分けてある。
 * キー・既定値・選択肢・許容範囲が 1 つの表から導出される形になっており、型だけをここへ写すと表が 2 枚になる。
 */
import type { Settings, SettingsPatch } from './settings-schema';

export type Eol = 'lf' | 'crlf';

export type Encoding = 'utf8' | 'utf16-le' | 'utf16-be' | 'shift-jis' | 'euc-jp';

export type ViewMode = 'preview' | 'edit' | 'split';

/**
 * 未保存のまま別の文書へ移るかの答え（`src-tauri/src/commands.rs` の `DiscardChoice`）。
 *
 * **綴りは Rust 側の serde が決める。** 同じ 3 語であることは
 * `discard_choice_serializes_in_camel_case` が固定している。
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

export interface DocumentPayload extends DocumentMeta {
  /** EOL を LF に正規化した本文 */
  content: string;
}

export interface WriteRequest {
  path: string;
  content: string;
  eol: Eol;
  bom: boolean;
  encoding: Encoding;
  /** `null` は新規ファイル。既存ファイルがあれば衝突扱いになる。 */
  expectedMtimeMs: number | null;
}

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
}

/* ------------------------------------------------------------------ */
/* ペイン（03.ux-spec/06-panes.md §3 / 02.architecture/04-rust-responsibilities.md §5）                 */
/* ------------------------------------------------------------------ */

/** ペイン 1 枚の状態（`src-tauri/src/store.rs` の `PaneState`）。 */
export interface PaneState {
  open: boolean;
  /** 幅（CSS ピクセル）。**左右で別々に記憶する**（03.ux-spec/06-panes.md §3）。 */
  width: number;
}

/**
 * 左右のペイン（`src-tauri/src/store.rs` の `Panes`）。
 *
 * `left`（Explorer）は M3 だが、器だけ先にある。後から足すと
 * 「どちらの幅か」が曖昧な 1 つの値が先に永続化されてしまう。
 */
export interface Panes {
  left: PaneState;
  right: PaneState;
}

/**
 * 記録が無いときの姿。**左右とも閉じている**（03.ux-spec/06-panes.md §3 の引用ブロック）。
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
 * **端まで寄せて片方を潰せないようにする。** 潰せると Split である意味が無くなり、
 * 戻す取っ手も同時に消える。
 */
export const SPLIT_DEFAULT = 0.5;
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

/* ------------------------------------------------------------------ */
/* ユーザー設定（02.architecture/04-rust-responsibilities.md §5）                               */
/* ------------------------------------------------------------------ */

/**
 * `settings.json` を読めなかった事実（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * これがある間、**アプリは既定値で動くがファイルを上書きしない**。
 * ユーザーが手で書いたものだから（02.architecture/04-rust-responsibilities.md §5）。
 */
export interface SettingsProblem {
  path: string;
  message: string;
}

export interface SettingsLoad {
  values: Settings;
  broken: SettingsProblem | null;
}

/* ------------------------------------------------------------------ */
/* カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）                   */
/* ------------------------------------------------------------------ */

/**
 * カスタム CSS を適用できなかった理由（`src-tauri/src/custom_css.rs`）。
 *
 * **「無い」はここに現れない。** ファイルが無いのは正常な状態であり
 * （設定項目を置かない以上、初回起動が常にそれ）、通知の材料にしない。
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

/* ------------------------------------------------------------------ */
/* ファイル監視（02.architecture/04-rust-responsibilities.md §4）                               */
/* ------------------------------------------------------------------ */

/**
 * 外部で何が起きたか。
 *
 * `removed` を分けているのは、**消えたファイルを読みに行かせない**ため。
 * 読みに行くと「開けません」が出て、作り直された瞬間にもう一度出る。
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

export interface TraceConfig {
  enabled: boolean;
  /** T0 時点の UNIX epoch ミリ秒。performance.timeOrigin をこの軸に載せ替える。 */
  t0EpochMs: number;
}

export interface BootstrapDocument extends DocumentMeta {
  /** 256KB を超えるファイルでは `null`。`readDocument` で取りに行く。 */
  content: string | null;
}

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
   * 立っていると `ready()` の後に `features/bench/input.ts`（遅延チャンク）が
   * 動き出し、打鍵を合成して結果を `benchInputDone` へ渡す。
   * **書き出し先はここに載らない**（任意のパスへ書ける口を作らないため）。
   */
  benchInput: boolean;
  trace: TraceConfig | null;
  pendingPaths: string[];
  unknownArgs: string[];
  /** Welcome 画面が起動直後に描くため、IPC 往復ではなくここに載る。 */
  recent: RecentEntry[];
  /** 表示倍率（F-VIEW-11）。最初のフレームから正しい倍率で描くために要る。 */
  zoom: number;
  /**
   * ペインの開閉と幅（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
   *
   * 倍率と同じ理由でここに載っている。
   * 後から当てると、本文が一度全幅で描かれた後に幅が縮小して見える（02.architecture/04-rust-responsibilities.md §5）。
   */
  panes: Panes;
  /**
   * Split の分割比（エディター側の取り分 / 03.ux-spec/03-split-mode.md §1）。
   *
   * **倍率・ペインと同じ理由でここに載る。** 後から当てると、Split で開いたときに
   * 50:50 で一度描かれてから寄る。
   */
  split: number;
  /**
   * ユーザー設定の**全体**（02.architecture/04-rust-responsibilities.md §5）。
   *
   * 「どの設定が初回フレームに間に合う必要があるか」を毎回考えなくて済むよう、
   * 選ばずに丸ごと載っている。**取りに行く経路（IPC 往復）は作らない。**
   */
  settings: Settings;
  /** `settings.json` を読めなかった事実。通知バーに出す（03.ux-spec/07-status-and-notifications.md §2）。 */
  settingsError: SettingsProblem | null;
  /**
   * カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）。
   *
   * **64KB 以下のときだけ `css` が入っている。** ここに載せるのは、
   * ダークな背景を当てているときに白い初期画面が一瞬見えるのを防ぐため。
   * 超えていれば `deferred` が立ち、`readCustomCss` で取りに行く。
   */
  customCss: CustomCss;
  /**
   * エディター用のカスタム CSS（`editor.css` / ADR-0013）。**本文用と完全に同じ扱い。**
   * 別のフィールドなのは、当てる先（`@scope` の根）が違うため。
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

export interface TraceMark {
  id: string;
  atMs: number;
  note?: string;
}

/**
 * ウィンドウへのドラッグ＆ドロップ（F-OPEN-08）。
 *
 * ブラウザの `DataTransfer` ではなく **OS 側のイベント**を使う。WebView は
 * ドロップされたファイルの絶対パスを JS に渡さないため、`DataTransfer` からでは
 * 最近開いたファイルに積めず、相対パスの画像も解決できない（F-VIEW-08 / N-SEC-05）。
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
 * 記録を分けるためだけに存在する。**混ぜてはいけない。**
 */
export type WarmKind = 'warm' | 'tray-resume';

/**
 * Platform 層のインタフェース。
 *
 * Domain 層はこれだけを見る。Tauri の存在を知らないことで、
 * Vitest 上でも `dev:web` のブラウザ上でも同じコードが動く（02.architecture/03-layers.md §1）。
 */
export interface Platform {
  readonly kind: 'tauri' | 'web';
  /** 同期的に読める初期ペイロード。IPC 往復を挟まないことが最重要。 */
  getBootstrap(): Bootstrap | null;
  /**
   * ファイルを読む。
   *
   * `encoding` はエンコーディングの**指定**（03.ux-spec/07-status-and-notifications.md §3
   * 「クリックでエンコーディング再解釈」）。**省略が通常の経路**で、
   * そのときだけ Rust 側の推定が走る。
   */
  readDocument(path: string, encoding?: Encoding): Promise<DocumentPayload>;
  writeDocument(req: WriteRequest): Promise<SaveResult>;
  /**
   * 相対パスの画像を、許可ディレクトリ配下であることを検証したうえで
   * **そのまま `<img src>` に入れられる URL** に変換する（F-VIEW-08 / N-SEC-05）。
   */
  resolveAsset(href: string, baseDir: string): Promise<string>;
  /** 最近開いたファイルに 1 件積む。更新後の一覧を返す（F-OPEN-09）。 */
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
   * 倍率と同じく、反映は呼び出し側が即座に行う。ここは保存だけなので、
   * **ドラッグ中に毎フレーム呼ばない**（デバウンスしてから呼ぶこと）。
   */
  setPanes(panes: Panes): Promise<void>;
  /**
   * Split の分割比を保存する（03.ux-spec/03-split-mode.md §1）。
   *
   * `setPanes` と同じく**ドラッグ中は呼ばない**（離した時点で 1 回だけ）。
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
   * `suggested` は初期表示するディレクトリとファイル名の元。
   * **返るパスは正規化されていない。** まだ存在しないことがあるため
   * （`src-tauri/src/commands.rs` の `pick_save_path`）。正規化は保存時に行われる。
   */
  pickSavePath(suggested: string | null): Promise<string | null>;
  /**
   * 未保存の変更があることを知らせる（F-EDIT-03）。
   *
   * **変わり目だけ呼ぶ。** 打鍵ごとに呼ぶものではない。
   * Rust 側が持っているのは、トレイメニューからの終了がフロントを経由しないため
   * （`src-tauri/src/state.rs` の `dirty`）。
   */
  setDirty(dirty: boolean): Promise<void>;
  /**
   * 未保存のまま別の文書へ移ってよいか尋ねる（F-EDIT-03 / N-REL-01）。
   *
   * **呼ぶかどうかは呼び出し側が決める。** ダーティでないときに呼ぶと、
   * 変更が無いのにダイアログが出る（`features/document/discard.ts`）。
   *
   * 3 択なので `boolean` では表せない。`'save'` は「保存してから移る」で、
   * **保存そのものはフロントが行う**（本文は CodeMirror の `EditorState` にある）。
   */
  confirmDiscard(): Promise<DiscardChoice>;
  /**
   * 設定を読み直す（F-CONF-03）。
   *
   * **起動時はこれを呼ばない。** 設定は bootstrap に丸ごと載っている。
   * ここが要るのは、外部エディターで編集されたあとの読み直しと設定 UI の再表示。
   */
  readSettings(): Promise<SettingsLoad>;
  /**
   * 変更したキーだけを書き戻す。更新後の設定全体を返す。
   * `settings.json` が読めない状態では拒否される（02.architecture/04-rust-responsibilities.md §5）。
   */
  writeSettings(patch: SettingsPatch): Promise<Settings>;
  /**
   * `settings.json` を OS の既定アプリで開く（F-CONF-06）。
   * 壊れた設定を通知バーから直せるようにするための逃げ道。
   */
  openSettingsFile(): Promise<void>;
  /**
   * カスタム CSS を読み直す（F-CONF-07 / 02.architecture/10-theming.md §3）。
   *
   * **起動時の 64KB 以下はこれを呼ばない。** bootstrap に同梱されている。
   * ここが要るのは「64KB を超えていて載らなかった」場合と、
   * 外部エディターで編集された後の読み直しだけ。
   */
  readCustomCss(): Promise<CustomCss>;

  /** `editor.css` を読み直す。`readCustomCss` と 1:1 の対。 */
  readEditorCss(): Promise<CustomCss>;
  /**
   * `custom.css` を OS の既定アプリで開く（F-CONF-07）。
   *
   * **無ければ雛形を作ってから開く。** 設定項目もパスの設定も置かない以上、
   * 「どこに書けばよいか」を知る手段がこのボタンしかない。
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

  /** `editor.css` の外部変更。**本文用と別のイベント**（片方だけを読み直す）。 */
  onEditorCssChanged(handler: () => void): () => void;
  /**
   * 開いているファイルの監視を始める（F-EDIT-16 / 02.architecture/04-rust-responsibilities.md §4）。
   *
   * **開いているファイルだけを見る**（N-PERF-05）。呼ぶたびに前のファイルの監視は
   * 外れる（タブが入る M3 までは対象が 1 つしかない）。
   */
  watchPath(path: string): Promise<void>;
  /** 監視をやめる。タブを閉じたとき（M3）に呼ぶ。 */
  unwatchPath(path: string): Promise<void>;
  /** 監視しているファイルの外部変更を購読する。 */
  onFileChanged(handler: (change: FileChange) => void): () => void;
  /**
   * `settings.json` の外部変更を購読する（02.architecture/04-rust-responsibilities.md §5）。
   *
   * 中身は渡さない。**受け取ったら `readSettings` で読み直して全体を当て直す**のが
   * 唯一の使い方で、差分を運ぶ意味がない（設定は小さい）。
   */
  onSettingsChanged(handler: () => void): () => void;
  /** ウィンドウへのドラッグ＆ドロップを購読する（F-OPEN-08）。 */
  onDragDrop(handler: (event: DragDropEvent) => void): () => void;
  /**
   * ウィンドウ操作（カスタムタイトルバー / 03.ux-spec/01-screen-layout.md §1）。
   *
   * `decorations: false` にしたぶん、`─ □ ✕` は自分たちの `<button>` になった。
   * 実体は Rust 側の自作コマンドで、JS の `@tauri-apps/api/window` は入れていない
   * （04.tech-stack/06-rust.md §2 と同じ判断）。
   *
   * ドラッグとダブルクリックによる最大化はここに無い。Tauri 本体が注入する
   * `data-tauri-drag-region` の処理が担当していて、フロントは属性を書くだけ。
   */
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  /**
   * 閉じる。
   *
   * **既定ではトレイに格納され、プロセスは終わらない**（ADR-0007 論点 2 /
   * 設定 `window.closeBehavior`）。判断は Rust 側の `close.rs` にあり、
   * フロントは「閉じてくれ」としか言わない。ここで分岐を持つと、
   * `Alt+F4` と OS 由来の閉じる要求だけ別の挙動になる。
   */
  closeWindow(): Promise<void>;
  /**
   * Marxdown を終了する（ADR-0007 論点 3）。
   *
   * **`closeWindow` とは別物。** トレイ常駐では `✕` が「格納」の意味になるため、
   * 「本当に終わらせたい」を表す経路が別に要る。`Ctrl+Q` とハンバーガーメニューの
   * 「終了」がここへ来る（3 経路のうちの 2 つ。残り 1 つはトレイメニュー）。
   */
  quitApp(): Promise<void>;
  /**
   * トレイメニューの「Marxdown を開く」を購読する。
   *
   * **Rust 側でダイアログを出さない。** 開いた結果の扱い（履歴・通知・
   * 相対パスの解決）は `open.ts` に集めてあり、別経路で開くとそこだけ抜ける。
   */
  onTrayOpen(handler: () => void): () => void;
  /** 最大化中か。購読を始めるときに 1 回だけ聞く。 */
  isWindowMaximized(): Promise<boolean>;
  /**
   * 最大化状態の変化を購読する。
   *
   * ボタン以外（`Win+↑` / ダブルクリック / 上端へのドラッグ）でも変わるので、
   * **押した側で状態を持たず、OS を真実にする**。Rust 側が変化したときだけ流す。
   */
  onWindowMaximizedChanged(handler: (maximized: boolean) => void): () => void;
  /**
   * 最大化ボタンの居場所（CSS ピクセル）を知らせる（Windows の Snap Layouts）。
   *
   * `decorations: false` にすると Windows はボタンの位置を知らず、
   * ホバーしてもレイアウト選択のフライアウトが出ない
   * （`src-tauri/src/snap_layouts.rs`）。**どこにあるかを知っているのは
   * レイアウトを組んでいるこちらだけ**なので、変わるたびに知らせる。
   */
  setSnapLayoutsTarget(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  /**
   * 最大化ボタンのホバー（Windows の Snap Layouts）。
   *
   * フライアウトを出すために非クライアント領域だと答えているので、
   * **その範囲には WebView のマウスイベントが届かない**（CSS の `:hover` が効かない）。
   * 最大化ボタンだけ反応しないのは目立つので、Rust 側が出入りを知らせてくる。
   */
  onMaximizeHoverChanged(handler: (hovered: boolean) => void): () => void;
  /** 描画準備完了。ウィンドウを表示させる。 */
  ready(): Promise<void>;
  reportTrace(marks: TraceMark[]): Promise<void>;
  /**
   * ウォーム起動の完了報告（S6）。argv 転送を受けてから
   * 「本文が読める」までの経過ミリ秒を返す。
   */
  warmDone(requestId: number, path: string, detail: string, kind?: WarmKind): Promise<number | null>;
  /**
   * 入力レスポンス計測の結果を渡す（`--bench-input` / 計測専用）。
   *
   * **渡したらプロセスが終わる。** 書き出し先は Rust 側が持っており
   * （`bench_input_done`）、こちらはパスを知らない。
   */
  benchInputDone(json: string): Promise<void>;
  /**
   * 終了の確認で「保存して終了」が選ばれたことを購読する（F-EDIT-03）。
   *
   * **保存できるのはフロントだけである**（本文は CodeMirror の `EditorState` にある）。
   * 受け取ったら保存し、成功したらもう一度 `quitApp()` を呼ぶ。
   * 失敗したらダーティのままなので、終了しない（N-REL-01）。
   */
  onSaveAndQuit(handler: () => void): () => void;
  /**
   * トレイから復帰した瞬間を購読する（ADR-0007「計測項目」）。
   *
   * **Warm Start とは別の経路である。** あちらは「ウィンドウが可視のまま argv 転送を
   * 受けた」値（実測 20.0ms）で、こちらは「サスペンドされた WebView が起こされて
   * 画面に出る」まで。同じ数字だと思って比べると判断を誤る。
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
