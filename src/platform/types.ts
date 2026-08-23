/**
 * Platform 層の型。Rust 側（`src-tauri/src/`）の serde 定義と 1:1 で対応する。
 *
 * ここが唯一の対応表なので、Rust 側を変えたらここも必ず変える。
 */

export type Eol = 'lf' | 'crlf'

export type Encoding = 'utf8' | 'utf16-le' | 'utf16-be' | 'shift-jis' | 'euc-jp'

export type ViewMode = 'preview' | 'edit' | 'split'

/** 02.architecture.md §4.2 `DocumentPayload` のメタ部分。 */
export interface DocumentMeta {
  /** 正規化済み絶対パス */
  path: string
  eol: Eol
  bom: boolean
  encoding: Encoding
  mtimeMs: number
  size: number
  readonly: boolean
}

export interface DocumentPayload extends DocumentMeta {
  /** EOL を LF に正規化した本文 */
  content: string
}

export interface WriteRequest {
  path: string
  content: string
  eol: Eol
  bom: boolean
  encoding: Encoding
  /** `null` は新規ファイル。既存ファイルがあれば衝突扱いになる。 */
  expectedMtimeMs: number | null
}

export type SaveResult =
  | { status: 'saved'; mtimeMs: number; size: number }
  | { status: 'conflict'; diskMtimeMs: number }

/** `src-tauri/src/error.rs` の `CoreError` のシリアライズ形。 */
export interface CoreError {
  kind:
    | 'not-found'
    | 'permission-denied'
    | 'out-of-scope'
    | 'too-large'
    | 'conflict'
    | 'invalid-argument'
    | 'io'
  message: string
}

/* ------------------------------------------------------------------ */
/* M0 のスパイク切り替え                                                */
/* ------------------------------------------------------------------ */

export interface SpikeFlags {
  /** S2: 初期コンテンツの受け渡し経路 */
  bootstrap: 'script' | 'invoke'
  /** S3: Markdown のパース場所 */
  parse: 'worker' | 'main'
  /** S7: 本文の DOM 投入方法 */
  paint: 'progressive' | 'bulk'
  /** S8: シェルの描画方法 */
  render: 'react' | 'dom'
}

export interface TraceConfig {
  enabled: boolean
  /** T0 時点の UNIX epoch ミリ秒。performance.timeOrigin をこの軸に載せ替える。 */
  t0EpochMs: number
}

export interface BootstrapDocument extends DocumentMeta {
  /** 256KB を超えるファイルでは `null`。`readDocument` で取りに行く。 */
  content: string | null
}

export interface BootstrapError {
  path: string
  kind: CoreError['kind']
  message: string
}

/** 最近開いたファイル（F-OPEN-09）。`src-tauri/src/store.rs` の `RecentEntry`。 */
export interface RecentEntry {
  /** 正規化済み絶対パス。表示用の分割は `splitPath` で行う。 */
  path: string
  openedAtMs: number
}

/** `window.__MARXDOWN_BOOTSTRAP__` の中身。 */
export interface Bootstrap {
  version: number
  document: BootstrapDocument | null
  documentError: BootstrapError | null
  mode: ViewMode | null
  spike: SpikeFlags
  trace: TraceConfig | null
  pendingPaths: string[]
  unknownArgs: string[]
  /** Welcome 画面が起動直後に描くため、IPC 往復ではなくここに載る。 */
  recent: RecentEntry[]
  /** 表示倍率（F-VIEW-11）。最初のフレームから正しい倍率で描くために要る。 */
  zoom: number
}

/** 別インスタンスから転送された起動要求（ウォーム起動）。 */
export interface OpenRequest {
  /** この要求の計測 ID。描画完了後に `warmDone` へ返す（S6）。 */
  requestId: number
  paths: string[]
  newWindow: boolean
  mode: ViewMode | null
  trace: boolean
}

export interface TraceMark {
  id: string
  atMs: number
  note?: string
}

/**
 * Platform 層のインタフェース。
 *
 * Domain 層はこれだけを見る。Tauri の存在を知らないことで、
 * Vitest 上でも `dev:web` のブラウザ上でも同じコードが動く（02.architecture.md §3.1）。
 */
export interface Platform {
  readonly kind: 'tauri' | 'web'
  /** 同期的に読める初期ペイロード。IPC 往復を挟まないことが最重要。 */
  getBootstrap(): Bootstrap | null
  /** bootstrap に本文が無かった場合（256KB 超 / invoke 経路）の取得経路。 */
  takeBootstrap(): Promise<Bootstrap | null>
  readDocument(path: string): Promise<DocumentPayload>
  writeDocument(req: WriteRequest): Promise<SaveResult>
  resolveAsset(href: string, baseDir: string): Promise<string>
  /** 最近開いたファイルに 1 件積む。更新後の一覧を返す（F-OPEN-09）。 */
  pushRecent(path: string): Promise<RecentEntry[]>
  /** 開けなくなったファイルを一覧から外す。更新後の一覧を返す。 */
  removeRecent(path: string): Promise<RecentEntry[]>
  /**
   * 表示倍率を永続化する（F-VIEW-11）。
   * 反映は呼び出し側が即座に行う。ここは保存だけなので、デバウンスして呼ぶこと。
   */
  setZoom(zoom: number): Promise<void>
  /** 描画準備完了。ウィンドウを表示させる。 */
  ready(): Promise<void>
  reportTrace(marks: TraceMark[]): Promise<void>
  /**
   * ウォーム起動の完了報告（S6）。argv 転送を受けてから
   * 「本文が読める」までの経過ミリ秒を返す。
   */
  warmDone(requestId: number, path: string, detail: string): Promise<number | null>
  openExternal(url: string): Promise<void>
  revealInFileManager(path: string): Promise<void>
  onOpenRequest(handler: (req: OpenRequest) => void): () => void
}
