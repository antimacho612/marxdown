/**
 * Tauri 実装。`invoke()` を呼んでよいのはこのファイルだけである。
 *
 * 02.architecture/03-layers.md §1: 「どこからでも `invoke()` が呼ばれる」状態を防ぐ。
 * IPC 呼び出し回数は性能に直結する。
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';

import { MARKDOWN_EXTENSIONS } from '@/lib/path';

import type { Settings } from './settings-schema';
import type {
  Bootstrap,
  DirEntry,
  DiscardChoice,
  DocumentPayload,
  EntriesMoved,
  EntriesRemoved,
  FileChange,
  FileList,
  Moved,
  OpenRequest,
  Platform,
  RecentEntry,
  SaveResult,
  SettingsLoad,
  TabArrival,
  TraceMark,
  UserTheme,
  WriteRequest,
} from './types';

const EVENT_OPEN_REQUEST = 'marxdown://open-request';
const EVENT_FILE_CHANGED = 'marxdown://file-changed';
const EVENT_SETTINGS_CHANGED = 'marxdown://settings-changed';
const EVENT_TRAY_OPEN = 'marxdown://tray-open';
const EVENT_TRAY_RESUME = 'marxdown://tray-resume';
const EVENT_SAVE_AND_QUIT = 'marxdown://save-and-quit';
const EVENT_SAVE_AND_CLOSE = 'marxdown://save-and-close';
const EVENT_THEMES_CHANGED = 'marxdown://themes-changed';
const EVENT_WINDOW_MAXIMIZED = 'marxdown://window-maximized';
const EVENT_MAXIMIZE_HOVER = 'marxdown://maximize-hover';
const EVENT_TAB_ARRIVE = 'marxdown://tab-arrive';
const EVENT_TAB_DRAG_OVER = 'marxdown://tab-drag-over';
const EVENT_DIR_CHANGED = 'marxdown://dir-changed';
const EVENT_ENTRIES_MOVED = 'marxdown://entries-moved';
const EVENT_ENTRIES_REMOVED = 'marxdown://entries-removed';

/**
 * このウィンドウ宛てのイベントだけを受け取る。
 *
 * `listen` の既定の宛先（`Any`）では、Rust が他のウィンドウ宛てに `emit_to` したイベントまで届く（Tauri の `match_any_or_filter`）。
 * ウィンドウが複数あると、1 枚へ送った転送・保存・最大化の通知を全部のウィンドウが処理してしまう。
 * 全体へ送る `emit`（ファイルの変更・設定の変更）は、ラベルを指定しても届く。
 */
function listenHere<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  return listen<T>(event, handler, { target: getCurrentWebview().label });
}

/**
 * Tauri の購読 API を、同期的に解除関数を返す形に揃える。
 *
 * `listen` 系は解除関数を Promise で返すため、購読が確立する前に解除された場合も取りこぼさないようにする。
 * 呼び出し側（Domain 層）は購読が非同期であることを意識せずに済む。
 */
function subscribe(start: () => Promise<UnlistenFn>): () => void {
  let dispose: UnlistenFn | null = null;
  let disposed = false;

  void start().then((un) => {
    if (disposed) un();
    else dispose = un;
    return un;
  });

  return () => {
    disposed = true;
    dispose?.();
  };
}

declare global {
  // `var` でなければならない。
  // `let` / `const` は `globalThis` のプロパティにならず、Rust の initialization_script が注入した値を型として参照できない。
  var __MARXDOWN_BOOTSTRAP__: Bootstrap | undefined;
  var __MARXDOWN_T4__: number | undefined;
}

/** Tauri 上での Platform 実装。`isTauri()` が真のときに選ばれる（`platform/index.ts`）。 */
export const tauriPlatform: Platform = {
  kind: 'tauri',

  getBootstrap() {
    return globalThis.__MARXDOWN_BOOTSTRAP__ ?? null;
  },

  readDocument(path, encoding) {
    // `encoding` が undefined のときは Rust 側で `None` になる（推定に任せる）。
    return invoke<DocumentPayload>('read_document', { path, encoding });
  },

  writeDocument(req: WriteRequest) {
    return invoke<SaveResult>('write_document', { req });
  },

  async resolveAsset(href, baseDir) {
    // Rust が返すのは検証済みの絶対パスである。
    // `asset:` プロトコルの URL へ変換して初めて WebView から読み込める（CSP の `img-src` が許可しているのはこの形式）。
    return convertFileSrc(await invoke<string>('resolve_asset', { href, baseDir }));
  },

  writeAsset(documentPath, extension, data) {
    // Tauri の IPC は `Uint8Array` をそのまま渡せない。数値の配列にして Rust 側の `Vec<u8>` へ受ける。
    return invoke<string>('write_asset', { documentPath, extension, data: [...data] });
  },

  async allowImageDir(href, baseDir) {
    return convertFileSrc(await invoke<string>('allow_image_dir', { href, baseDir }));
  },

  listDir(path, root) {
    return invoke<DirEntry[]>('list_dir', { path, root });
  },

  listFiles(root) {
    // 拡張子はここから渡す。Markdown の判断は `lib/path.ts` の 1 か所にしかない。
    return invoke<FileList>('list_files', { path: root, extensions: MARKDOWN_EXTENSIONS });
  },

  watchTree(dirs) {
    return invoke<void>('watch_tree', { dirs });
  },

  onDirChanged(handler) {
    return subscribe(() => listenHere<FileChange>(EVENT_DIR_CHANGED, (event) => handler(event.payload.path)));
  },

  createEntry(parent, name, dir) {
    return invoke<string>('create_entry', { parent, name, dir });
  },

  renameEntry(path, newName) {
    return invoke<Moved>('rename_entry', { path, newName });
  },

  moveEntries(paths, dest) {
    return invoke<Moved[]>('move_entries', { paths, dest });
  },

  copyEntries(paths, dest) {
    return invoke<string[]>('copy_entries', { paths, dest });
  },

  trashEntries(paths) {
    return invoke<string[]>('trash_entries', { paths });
  },

  importDropped(paths, dest) {
    return invoke<string[]>('import_dropped', { paths, dest });
  },

  openDroppedFolder(path) {
    return invoke<string>('open_dropped_folder', { path });
  },

  onEntriesMoved(handler) {
    return subscribe(() => listenHere<EntriesMoved>(EVENT_ENTRIES_MOVED, (event) => handler(event.payload)));
  },

  onEntriesRemoved(handler) {
    return subscribe(() => listenHere<EntriesRemoved>(EVENT_ENTRIES_REMOVED, (event) => handler(event.payload)));
  },

  confirmAction(message, confirm) {
    return invoke<boolean>('confirm_action', { message, confirm });
  },

  setSession(paths, active) {
    return invoke<void>('store_set_session', { paths, active });
  },

  pushRecent(path) {
    return invoke<RecentEntry[]>('store_push_recent', { path });
  },

  removeRecent(path) {
    return invoke<RecentEntry[]>('store_remove_recent', { path });
  },

  setZoom(zoom) {
    return invoke<void>('store_set_zoom', { zoom });
  },

  setPanes(panes) {
    return invoke<void>('store_set_panes', { panes });
  },

  setSplit(split) {
    return invoke<void>('store_set_split', { split });
  },

  pickFile() {
    return invoke<string | null>('pick_file');
  },

  pickFolder() {
    return invoke<string | null>('pick_folder');
  },

  pickSavePath(suggested) {
    return invoke<string | null>('pick_save_path', { suggested });
  },

  setDirty(dirty) {
    return invoke<void>('set_dirty', { dirty });
  },

  confirmDiscard() {
    return invoke<DiscardChoice>('confirm_discard');
  },

  readSettings() {
    return invoke<SettingsLoad>('read_settings');
  },

  writeSettings(patch) {
    return invoke<Settings>('write_settings', { patch });
  },

  openSettingsFile() {
    return invoke<void>('open_settings_file');
  },

  listUserThemes() {
    return invoke<UserTheme[]>('list_user_themes');
  },

  openThemesDir() {
    return invoke<void>('open_themes_dir');
  },

  onUserThemesChanged(handler) {
    return subscribe(() => listenHere(EVENT_THEMES_CHANGED, () => handler()));
  },

  watchPath(path) {
    return invoke<void>('watch_path', { path });
  },

  unwatchPath(path) {
    return invoke<void>('unwatch_path', { path });
  },

  onFileChanged(handler) {
    return subscribe(() => listenHere<FileChange>(EVENT_FILE_CHANGED, (event) => handler(event.payload)));
  },

  onSettingsChanged(handler) {
    return subscribe(() => listenHere(EVENT_SETTINGS_CHANGED, () => handler()));
  },

  onDragDrop(handler) {
    return subscribe(() =>
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'leave') {
          handler({ type: 'leave' });
          return;
        }
        // 位置は物理ピクセルで届く。`elementFromPoint` に渡せるよう CSS ピクセルへ直す。
        const x = payload.position.x / globalThis.devicePixelRatio;
        const y = payload.position.y / globalThis.devicePixelRatio;
        if (payload.type === 'drop') handler({ type: 'drop', paths: payload.paths, x, y });
        else handler({ type: 'over', x, y });
      }),
    );
  },

  minimizeWindow() {
    return invoke<void>('window_minimize');
  },

  toggleMaximizeWindow() {
    return invoke<void>('window_toggle_maximize');
  },

  closeWindow() {
    return invoke<void>('window_close');
  },

  openSatellite(options = {}) {
    return invoke<void>('open_satellite', {
      paths: options.paths ?? [],
      mode: options.mode ?? null,
      transfer: options.transfer ?? null,
      position: options.position ?? null,
    });
  },

  stashTransfer(payload) {
    return invoke<number>('stash_transfer', { payload });
  },

  takeTransfer(id) {
    return invoke<string | null>('take_transfer', { id });
  },

  sendTabToWindow(target, handoff) {
    return invoke<void>('move_tab_to_window', {
      target,
      paths: handoff.paths ?? [],
      transfer: handoff.transfer ?? null,
    });
  },

  onTabArrive(handler) {
    return subscribe(() => listenHere<TabArrival>(EVENT_TAB_ARRIVE, (event) => handler(event.payload)));
  },

  beginTabDrag(ghost) {
    return invoke<void>('tab_drag_begin', { label: ghost.label, colors: ghost.colors });
  },

  moveTabDrag() {
    return invoke<void>('tab_drag_move');
  },

  endTabDrag() {
    return invoke<string | null>('tab_drag_end');
  },

  onTabDragOver(handler) {
    return subscribe(() => listenHere<boolean>(EVENT_TAB_DRAG_OVER, (event) => handler(event.payload)));
  },

  quitApp() {
    return invoke<void>('app_quit');
  },

  onTrayOpen(handler) {
    return subscribe(() => listenHere(EVENT_TRAY_OPEN, () => handler()));
  },

  onSaveAndQuit(handler) {
    return subscribe(() => listenHere(EVENT_SAVE_AND_QUIT, () => handler()));
  },

  onSaveAndClose(handler) {
    return subscribe(() => listenHere(EVENT_SAVE_AND_CLOSE, () => handler()));
  },

  onTrayResume(handler) {
    return subscribe(() => listenHere<number>(EVENT_TRAY_RESUME, (event) => handler(event.payload)));
  },

  isWindowMaximized() {
    return invoke<boolean>('window_is_maximized');
  },

  onWindowMaximizedChanged(handler) {
    return subscribe(() => listenHere<boolean>(EVENT_WINDOW_MAXIMIZED, (event) => handler(event.payload)));
  },

  setSnapLayoutsTarget(rect) {
    return invoke<void>('set_snap_layouts_target', rect);
  },

  onMaximizeHoverChanged(handler) {
    return subscribe(() => listenHere<boolean>(EVENT_MAXIMIZE_HOVER, (event) => handler(event.payload)));
  },

  ready() {
    return invoke<void>('ready');
  },

  reportTrace(marks: TraceMark[]) {
    return invoke<void>('report_trace', { marks });
  },

  warmDone(requestId, path, detail, kind) {
    return invoke<number | null>('warm_done', { requestId, path, detail, kind });
  },

  benchInputDone(json) {
    return invoke<void>('bench_input_done', { json });
  },

  openExternal(url) {
    return invoke<void>('open_external', { url });
  },

  openLocalFile(path) {
    return invoke<void>('open_local_file', { path });
  },

  revealInFileManager(path) {
    return invoke<void>('reveal_in_file_manager', { path });
  },

  onOpenRequest(handler) {
    return subscribe(() => listenHere<OpenRequest>(EVENT_OPEN_REQUEST, (event) => handler(event.payload)));
  },
};
