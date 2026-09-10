/**
 * Tauri 実装。`invoke()` を呼んでよいのはこのファイルだけである。
 *
 * 02.architecture/03-layers.md §1: 「どこからでも `invoke()` が呼ばれる」状態を防ぐ。
 * IPC 呼び出し回数は性能に直結する。
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';

import { MARKDOWN_EXTENSIONS } from '@/lib/path';

import type { Settings } from './settings-schema';
import type {
  Bootstrap,
  CustomCss,
  DirEntry,
  DiscardChoice,
  DocumentPayload,
  FileChange,
  FileList,
  OpenRequest,
  Platform,
  RecentEntry,
  SaveResult,
  SettingsLoad,
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
const EVENT_CUSTOM_CSS_CHANGED = 'marxdown://custom-css-changed';
const EVENT_THEMES_CHANGED = 'marxdown://themes-changed';
const EVENT_WINDOW_MAXIMIZED = 'marxdown://window-maximized';
const EVENT_MAXIMIZE_HOVER = 'marxdown://maximize-hover';

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

  listDir(path) {
    return invoke<DirEntry[]>('list_dir', { path });
  },

  listFiles(root) {
    // 拡張子はここから渡す。Markdown の判断は `lib/path.ts` の 1 か所にしかない。
    return invoke<FileList>('list_files', { path: root, extensions: MARKDOWN_EXTENSIONS });
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

  readCustomCss() {
    return invoke<CustomCss>('read_custom_css');
  },

  openCustomCssFile() {
    return invoke<void>('open_custom_css_file');
  },

  onCustomCssChanged(handler) {
    return subscribe(() => listen(EVENT_CUSTOM_CSS_CHANGED, () => handler()));
  },

  listUserThemes() {
    return invoke<UserTheme[]>('list_user_themes');
  },

  openThemesDir() {
    return invoke<void>('open_themes_dir');
  },

  onUserThemesChanged(handler) {
    return subscribe(() => listen(EVENT_THEMES_CHANGED, () => handler()));
  },

  watchPath(path) {
    return invoke<void>('watch_path', { path });
  },

  unwatchPath(path) {
    return invoke<void>('unwatch_path', { path });
  },

  onFileChanged(handler) {
    return subscribe(() => listen<FileChange>(EVENT_FILE_CHANGED, (event) => handler(event.payload)));
  },

  onSettingsChanged(handler) {
    return subscribe(() => listen(EVENT_SETTINGS_CHANGED, () => handler()));
  },

  onDragDrop(handler) {
    return subscribe(() =>
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'drop') handler({ type: 'drop', paths: payload.paths });
        else if (payload.type === 'over') handler({ type: 'over' });
        else handler({ type: 'leave' });
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

  quitApp() {
    return invoke<void>('app_quit');
  },

  onTrayOpen(handler) {
    return subscribe(() => listen(EVENT_TRAY_OPEN, () => handler()));
  },

  onSaveAndQuit(handler) {
    return subscribe(() => listen(EVENT_SAVE_AND_QUIT, () => handler()));
  },

  onTrayResume(handler) {
    return subscribe(() => listen<number>(EVENT_TRAY_RESUME, (event) => handler(event.payload)));
  },

  isWindowMaximized() {
    return invoke<boolean>('window_is_maximized');
  },

  onWindowMaximizedChanged(handler) {
    return subscribe(() => listen<boolean>(EVENT_WINDOW_MAXIMIZED, (event) => handler(event.payload)));
  },

  setSnapLayoutsTarget(rect) {
    return invoke<void>('set_snap_layouts_target', rect);
  },

  onMaximizeHoverChanged(handler) {
    return subscribe(() => listen<boolean>(EVENT_MAXIMIZE_HOVER, (event) => handler(event.payload)));
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
    return subscribe(() => listen<OpenRequest>(EVENT_OPEN_REQUEST, (event) => handler(event.payload)));
  },
};
