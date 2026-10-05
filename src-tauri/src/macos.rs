//! macOS だけの OS 連携（ADR-0028 / M10 §4.3・§4.4・§4.6・§4.8）。
//!
//! Finder からの起動・Dock からの復帰・アプリのメニュー・Dock からの終了・表示言語・OS の版を扱う。

use std::sync::OnceLock;

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

use crate::state::AppState;

/// アプリのメニューの「終了」。
const ID_QUIT: &str = "app:quit";

/// Finder・`open`・Dock へのドロップから届いた「開く」（`RunEvent::Opened`）。
///
/// これらの経路ではファイルが argv ではなくこのイベントで届く。
/// 主ウィンドウを作る前に届いた分は起動時の引数として扱い（`lib.rs` の `setup`）、`ready` の前に届いた分は `ready` の応答で返す（`commands::ready`）。
/// それより後は argv 転送と同じ経路に載せる。
pub fn on_opened<R: Runtime>(app: &AppHandle<R>, urls: Vec<tauri::Url>) {
    let paths: Vec<String> = urls
        .iter()
        .filter_map(|url| url.to_file_path().ok())
        .map(|path| path.display().to_string())
        .collect();
    if paths.is_empty() {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let Some(paths) = state.defer_open(paths) {
        crate::close::restore(app);
        crate::forward_open(app, paths);
    }
}

/// Dock のアイコンが押された（`RunEvent::Reopen`）。
///
/// 見えているウィンドウが無ければ、格納したウィンドウを戻す（ADR-0028 §3.4）。
pub fn on_reopen<R: Runtime>(app: &AppHandle<R>, has_visible_windows: bool) {
    if !has_visible_windows {
        crate::close::restore(app);
    }
}

/// アプリのメニュー（M10 §4.4 / §4.6）。
///
/// メニューバーを置かない判断は変えず、OS が要求する最小限だけを置く。
/// WKWebView は編集メニューが無いと `Cmd+C` / `Cmd+V` / `Cmd+A` が効かない。
///
/// Tauri の既定のメニューは使わない。
/// 「ウインドウを閉じる」が `Cmd+W`（タブを閉じる）を奪い、「終了」が `app.exit` を直接呼んで未保存の確認（`close::request_quit`）を通らない。
pub fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let text = crate::i18n::text();
    let quit = MenuItem::with_id(app, ID_QUIT, text.menu_quit, true, Some("CmdOrCtrl+Q"))?;
    let app_menu = Submenu::with_items(
        app,
        "Marxdown",
        true,
        &[
            &PredefinedMenuItem::hide(app, Some(text.menu_hide))?,
            &PredefinedMenuItem::hide_others(app, Some(text.menu_hide_others))?,
            &PredefinedMenuItem::show_all(app, Some(text.menu_show_all))?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        text.menu_edit,
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(text.menu_undo))?,
            &PredefinedMenuItem::redo(app, Some(text.menu_redo))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(text.menu_cut))?,
            &PredefinedMenuItem::copy(app, Some(text.menu_copy))?,
            &PredefinedMenuItem::paste(app, Some(text.menu_paste))?,
            &PredefinedMenuItem::select_all(app, Some(text.menu_select_all))?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        text.menu_window,
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(text.menu_minimize))?,
            &PredefinedMenuItem::maximize(app, Some(text.menu_zoom))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some(text.menu_fullscreen))?,
        ],
    )?;
    Menu::with_items(app, &[&app_menu, &edit, &window])
}

/// アプリのメニューの操作。
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id().as_ref() == ID_QUIT {
        crate::close::request_quit(app);
    }
}

/// `applicationShouldTerminate:` から未保存の確認へ通すためのハンドル。
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Dock の「終了」とログアウトを、未保存の確認（`close::request_quit`）へ通す。
/// `setup` で 1 回だけ呼ぶ。
///
/// HACK: tao 0.37 のアプリのデリゲートは `applicationShouldTerminate:` を実装しておらず、これらの経路は確認を通らずにプロセスを終える。
/// Tauri にも止める手段が無いため、デリゲートのクラスへメソッドを足す。
/// tao が実装したら（`class_addMethod` が `NO` を返すようになったら）取り除く。
pub fn guard_termination(app: &AppHandle) {
    use objc2::runtime::{AnyClass, Imp, Sel};
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::NSApplication;

    let _ = APP.set(app.clone());
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let ns_app = NSApplication::sharedApplication(mtm);
    let Some(delegate) = ns_app.delegate() else {
        return;
    };
    let object: &objc2::runtime::AnyObject = delegate.as_ref();
    let class: *const AnyClass = object.class();

    // 戻り値は `NSApplicationTerminateReply`（`NSUInteger`）。
    let reply: extern "C-unwind" fn(
        &objc2::runtime::AnyObject,
        Sel,
        *mut objc2::runtime::AnyObject,
    ) -> usize = should_terminate;
    // SAFETY: 型エンコーディング（`Q@:@`）は `reply` の引数と戻り値に一致している。
    // クラスはデリゲートの実体のものであり、プロセスが終わるまで解放されない。
    let added = unsafe {
        objc2::ffi::class_addMethod(
            class.cast_mut(),
            sel!(applicationShouldTerminate:),
            std::mem::transmute::<
                extern "C-unwind" fn(
                    &objc2::runtime::AnyObject,
                    Sel,
                    *mut objc2::runtime::AnyObject,
                ) -> usize,
                Imp,
            >(reply),
            c"Q@:@".as_ptr(),
        )
    };
    if !added.as_bool() {
        eprintln!("[marxdown] Dock からの終了を確認へ通せなかった");
    }
}

/// `NSTerminateCancel`
const TERMINATE_CANCEL: usize = 0;
/// `NSTerminateNow`
const TERMINATE_NOW: usize = 1;

/// 未保存の変更が無ければそのまま終わらせ、あれば止めて確認を出す。
///
/// 変更が無いときに止めてから自分で終えると、ログアウトが「Marxdown が中止した」として取り消される。
extern "C-unwind" fn should_terminate(
    _this: &objc2::runtime::AnyObject,
    _cmd: objc2::runtime::Sel,
    _sender: *mut objc2::runtime::AnyObject,
) -> usize {
    let Some(app) = APP.get() else {
        return TERMINATE_NOW;
    };
    let dirty = app
        .try_state::<AppState>()
        .is_some_and(|state| state.is_dirty());
    if !dirty {
        crate::close::save_window_state(app);
        return TERMINATE_NOW;
    }
    crate::close::request_quit(app);
    TERMINATE_CANCEL
}

/// OS の第一言語が日本語か（`NSLocale.preferredLanguages`）。
///
/// Finder から起動したプロセスには `LANG` が無いため、環境変数では判定できない（M10 §4.8）。
pub fn prefers_japanese() -> bool {
    objc2_foundation::NSLocale::preferredLanguages()
        .firstObject()
        .is_some_and(|lang| lang.to_string().starts_with("ja"))
}

/// OS の名前と版（「Marxdown について」/ F-OS-09）。
///
/// `operatingSystemVersionString` は `Version 15.1 (Build 24B83)` の形を返す。
pub fn os_version() -> String {
    let version = objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersionString();
    format!(
        "macOS {}",
        version.to_string().trim_start_matches("Version ")
    )
}
