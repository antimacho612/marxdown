/**
 * Platform 層の型。Rust 側（`src-tauri/src/`）の serde 定義と 1:1 で対応する。
 *
 * ここが唯一の対応表なので、Rust 側を変えたらここも必ず変える。
 * 設定の既定値（`DEFAULT_SETTINGS`）だけは値だが、同じ理由でここに置いている。
 */

export type Eol = 'lf' | 'crlf';

export type Encoding = 'utf8' | 'utf16-le' | 'utf16-be' | 'shift-jis' | 'euc-jp';

export type ViewMode = 'preview' | 'edit' | 'split';

/** 02.architecture.md §4.2 `DocumentPayload` のメタ部分。 */
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
/* ユーザー設定（02.architecture.md §4.5）                               */
/* ------------------------------------------------------------------ */

export type Theme = 'system' | 'light' | 'dark';

/** ウィンドウを閉じたときの挙動。**実際に効くのは M1.5 Phase 7 から。** */
export type WindowCloseBehavior = 'tray' | 'exit';

/**
 * `settings.json` の中身（`src-tauri/src/settings.rs` の `Settings`）。
 *
 * **キーは VS Code と同じフラットなドット区切り**（F-CONF-06）。
 * ネストしたオブジェクトにしないのは、手で書く / 部分的に上書きする / 未知のキーを
 * 保持する、のすべてが 1 階層のほうが素直になるため。
 *
 * ここに現れないキーもファイルには入りうる（未知のキーは保持される）。
 */
export interface Settings {
  theme: Theme;
  /** 空文字は「トークン層の既定スタックを使う」。 */
  'preview.fontFamily': string;
  'preview.fontSize': number;
  'preview.lineHeight': number;
  /** 本文幅。単位は `ch`（02.architecture.md §10.2）。 */
  'preview.maxWidth': number;
  'window.closeBehavior': WindowCloseBehavior;
}

/**
 * 既定値。`src-tauri/src/settings.rs` の `Settings::default()` と 1:1 で対応する。
 *
 * 実際に届く値は Rust 側で既定値を埋めた後のものなので、これが要るのは
 * bootstrap を持たない経路（`dev:web` の初回・テスト）だけ。
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  'preview.fontFamily': '',
  'preview.fontSize': 16,
  'preview.lineHeight': 1.75,
  'preview.maxWidth': 100,
  'window.closeBehavior': 'tray',
};

/** 変更したキーだけを渡す。**`null` はキーを消す**（既定値に戻る）。 */
export type SettingsPatch = { [K in keyof Settings]?: Settings[K] | null };

/**
 * `settings.json` を読めなかった事実（03.ux-spec.md §8.2）。
 *
 * これがある間、**アプリは既定値で動くがファイルを上書きしない**。
 * ユーザーが手で書いたものだから（02.architecture.md §4.5）。
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
/* ファイル監視（02.architecture.md §4.4）                               */
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

/* ------------------------------------------------------------------ */
/* 比較経路の切り替え                                                    */
/* ------------------------------------------------------------------ */

/**
 * 比較経路の切り替え。開発ビルドでのみ意味を持つ。
 *
 * **Worker を維持するかどうか（OQ-15）が未決のため、比較経路を保持している。**
 * 結論が出たら、この enum ごと畳む。
 */
export interface SpikeFlags {
  /** Markdown のパース場所 */
  parse: 'worker' | 'main';
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
  spike: SpikeFlags;
  trace: TraceConfig | null;
  pendingPaths: string[];
  unknownArgs: string[];
  /** Welcome 画面が起動直後に描くため、IPC 往復ではなくここに載る。 */
  recent: RecentEntry[];
  /** 表示倍率（F-VIEW-11）。最初のフレームから正しい倍率で描くために要る。 */
  zoom: number;
  /**
   * ユーザー設定の**全体**（02.architecture.md §4.5）。
   *
   * 「どの設定が初回フレームに間に合う必要があるか」を毎回考えなくて済むよう、
   * 選ばずに丸ごと載っている。**取りに行く経路（IPC 往復）は作らない。**
   */
  settings: Settings;
  /** `settings.json` を読めなかった事実。通知バーに出す（03.ux-spec.md §8.2）。 */
  settingsError: SettingsProblem | null;
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
 * Platform 層のインタフェース。
 *
 * Domain 層はこれだけを見る。Tauri の存在を知らないことで、
 * Vitest 上でも `dev:web` のブラウザ上でも同じコードが動く（02.architecture.md §3.1）。
 */
export interface Platform {
  readonly kind: 'tauri' | 'web';
  /** 同期的に読める初期ペイロード。IPC 往復を挟まないことが最重要。 */
  getBootstrap(): Bootstrap | null;
  readDocument(path: string): Promise<DocumentPayload>;
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
   * ファイル選択ダイアログを開く（F-OPEN-07）。
   * 選ばれなければ `null`。返るのは正規化済み絶対パス。
   */
  pickFile(): Promise<string | null>;
  /**
   * 設定を読み直す（F-CONF-03）。
   *
   * **起動時はこれを呼ばない。** 設定は bootstrap に丸ごと載っている。
   * ここが要るのは、外部エディタで編集されたあとの読み直しと設定 UI の再表示。
   */
  readSettings(): Promise<SettingsLoad>;
  /**
   * 変更したキーだけを書き戻す。更新後の設定全体を返す。
   * `settings.json` が読めない状態では拒否される（02.architecture.md §4.5）。
   */
  writeSettings(patch: SettingsPatch): Promise<Settings>;
  /**
   * `settings.json` を OS の既定アプリで開く（F-CONF-06）。
   * 壊れた設定を通知バーから直せるようにするための逃げ道。
   */
  openSettingsFile(): Promise<void>;
  /**
   * 開いているファイルの監視を始める（F-EDIT-16 / 02.architecture.md §4.4）。
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
   * `settings.json` の外部変更を購読する（§4.5）。
   *
   * 中身は渡さない。**受け取ったら `readSettings` で読み直して全体を当て直す**のが
   * 唯一の使い方で、差分を運ぶ意味がない（設定は小さい）。
   */
  onSettingsChanged(handler: () => void): () => void;
  /** ウィンドウへのドラッグ＆ドロップを購読する（F-OPEN-08）。 */
  onDragDrop(handler: (event: DragDropEvent) => void): () => void;
  /**
   * ウィンドウ操作（カスタムタイトルバー / 03.ux-spec.md §2.1 / OQ-02 = B）。
   *
   * `decorations: false` にしたぶん、`─ □ ✕` は自分たちの `<button>` になった。
   * 実体は Rust 側の自作コマンドで、JS の `@tauri-apps/api/window` は入れていない
   * （04.tech-stack.md §6.2 と同じ判断）。
   *
   * ドラッグとダブルクリックによる最大化はここに無い。Tauri 本体が注入する
   * `data-tauri-drag-region` の処理が担当していて、フロントは属性を書くだけ。
   */
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  /** 閉じる。**Phase 7 でトレイ格納に化けるのはこの先**（`window.closeBehavior`）。 */
  closeWindow(): Promise<void>;
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
  warmDone(requestId: number, path: string, detail: string): Promise<number | null>;
  openExternal(url: string): Promise<void>;
  /**
   * Markdown 以外のローカルファイルを OS の既定アプリで開く（F-VIEW-06）。
   * 許可ディレクトリの外は Rust 側で拒まれる。
   */
  openLocalFile(path: string): Promise<void>;
  revealInFileManager(path: string): Promise<void>;
  onOpenRequest(handler: (req: OpenRequest) => void): () => void;
}
