//! Windows の Snap Layouts（最大化ボタンにホバーすると出るレイアウト選択）。
//!
//! # なぜ自前で要るのか
//!
//! `decorations: false`（`window.rs`）にすると、Windows は最大化ボタンが
//! **どこにあるのかを知らない**。Snap Layouts のフライアウトは
//! 「`WM_NCHITTEST` に `HTMAXBUTTON` を返す矩形」に対して出るので、
//! 自前のタイトルバーでは自分で答えないと出てこない。
//!
//! `Win+←` などのキーボードによるスナップは装飾を切っても効いており
//! （`WS_THICKFRAME` と `WS_MAXIMIZEBOX` が残るため）、ここで補うのは
//! **マウスでの Snap Layouts だけ**である。
//!
//! # 親ウィンドウのサブクラス化では出ない（実測）
//!
//! 最初の実装は親ウィンドウを `SetWindowSubclass` して `WM_NCHITTEST` に
//! `HTMAXBUTTON` を返していた。**Microsoft の手順どおりだが、この構成では効かない。**
//!
//! `SendMessage(hwnd, WM_NCHITTEST, ...)` で確かめたところ、親ウィンドウは
//! 最大化ボタンの上で正しく `HTMAXBUTTON`（9）を返していた。それでもフライアウトは出ない。
//!
//! 効かない理由は、**クライアント領域全体を WebView2 の子ウィンドウが覆っている**こと。
//! シェルがフライアウトの判定に使うのはカーソル直下の**最も深いウィンドウ**の
//! ヒットテストであり、そこに居るのは WebView2 の子（`HTCLIENT` を返す）である。
//! 親が返す `HTMAXBUTTON` は自分あてのマウスメッセージの経路を変えるだけで、
//! シェルの問い合わせには乗らない。
//!
//! # だから、ボタンの上に実体のある子ウィンドウを置く
//!
//! 最大化ボタンとぴったり重なる `WS_CHILD` を 1 枚作り、**そのウィンドウ自身が**
//! `WM_NCHITTEST` に `HTMAXBUTTON` を返す。これでカーソル直下の最も深いウィンドウが
//! `HTMAXBUTTON` を返す状態になり、シェルがフライアウトを出す。
//!
//! Tauri 界隈で動いている実装（`tauri-plugin-frame` / `tauri-plugin-decoration`）は
//! いずれもこの形を採っている。tauri#4531 が `upstream` のまま閉じていないのも同じ理由である。
//!
//! # このモジュールは無くても他が全部動く
//!
//! 失敗したら何もしないで戻る（`install` の返り値は無視してよい）。
//! そのときに起きるのは「最大化ボタンにホバーしてもフライアウトが出ない」ことだけで、
//! ボタンそのものはフロントの `<button>` として今までどおり押せる。
//!
//! # 実装の要点
//!
//! - オーバーレイは**矩形が届くまで見せない**（`WS_VISIBLE` を付けずに作る）。
//!   壊れたときの最悪が「フライアウトが出ない」に留まり、
//!   「見当違いの場所が押せなくなる」にならないようにする
//! - **背景を塗らない**（`WM_ERASEBKGND` で 1 を返す）。塗ると本文の上に穴が空く。
//!   WebView2 は DirectComposition で描くので、入力だけを受ける板として重ねられる
//! - ウィンドウ操作は Tauri を経由せず `WM_SYSCOMMAND` を投げる。
//!   ウィンドウプロシージャの中から Tauri の同期 API を呼ぶと、
//!   イベントループへ入れ子で入ることになる
//! - 上端 4px はオーバーレイに届かない。親が先に `HTTOP`（リサイズ縁）を返すためで、
//!   **これは Windows 標準のタイトルバーと同じ挙動**である
//!
//! # ホバーの塗りが自前で要る理由
//!
//! オーバーレイが被った領域には WebView のマウスイベントが届かない。
//! つまり CSS の `:hover` が効かなくなる。最大化ボタンだけ反応しないのは目立つので、
//! 出入りしたときだけ `marxdown://maximize-hover` を流してフロントに塗らせる。
//! クリックも同じ理由で `onclick` が発火しない（キーボードからは今までどおり発火する）。
#![cfg(windows)]

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Arc, Once};

use tauri::{Emitter, WebviewWindow};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, NULL_BRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT,
};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetParent, GetWindowLongPtrW, IsZoomed, PostMessageW,
    RegisterClassExW, SetWindowLongPtrW, SetWindowPos, ShowWindow, CREATESTRUCTW, GWLP_USERDATA,
    HTMAXBUTTON, HWND_TOP, SC_MAXIMIZE, SC_RESTORE, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
    SWP_SHOWWINDOW, SW_HIDE, WINDOW_EX_STYLE, WM_DPICHANGED, WM_ERASEBKGND, WM_NCCREATE,
    WM_NCDESTROY, WM_NCHITTEST, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE,
    WM_SIZE, WM_SYSCOMMAND, WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS,
};

/// 最大化ボタンのホバー状態（ペイロードは `bool`）。**出入りしたときだけ**流す。
pub const EVENT_MAXIMIZE_HOVER: &str = "marxdown://maximize-hover";

/// オーバーレイのウィンドウクラス名。
const OVERLAY_CLASS: PCWSTR = w!("MarxdownSnapOverlay");

/// 親に付けるサブクラスの識別子。位置の追従にしか使わない。
const PARENT_SUBCLASS_ID: usize = 0x6d78_0001; // "mx" + 連番

/// 論理ピクセルの既定 DPI。`GetDpiForWindow` の返り値をこれで割ると倍率になる。
const BASE_DPI: f64 = 96.0;

/// 最大化ボタンの居場所と、いまホバーしているか。
///
/// ウィンドウプロシージャ（オーバーレイの `GWLP_USERDATA` と親のサブクラスの
/// `dwRefData`）と IPC コマンドの 3 か所から触るので `Arc` で持つ。
/// 中身はロックを取らない。**プロシージャの中で待てるものは何も無い**（UI スレッドを止める）。
pub struct SnapTarget {
    /// 矩形（CSS px）。x / y / w / h を 16bit ずつ詰めてある。
    /// 幅か高さが 0 なら「まだ知らない」。
    rect: AtomicU64,
    hovered: AtomicBool,
    /// オーバーレイの上で押し下げたか。押した場所と離した場所が
    /// 揃ったときだけ最大化する（Windows の作法）。
    pressed: AtomicBool,
    /// オーバーレイを作り終えたか。受け皿の生成（`prepare`）と作成（`install`）が
    /// 別のタイミングなので、状態の有無では代用できない。
    installed: AtomicBool,
    /// オーバーレイの `HWND`。0 なら未作成。
    overlay: AtomicIsize,
    window: WebviewWindow,
}

impl SnapTarget {
    fn rect(&self) -> (f64, f64, f64, f64) {
        let packed = self.rect.load(Ordering::Relaxed);
        let at = |shift: u32| ((packed >> shift) & 0xffff) as f64;
        (at(48), at(32), at(16), at(0))
    }

    fn store_rect(&self, x: f64, y: f64, width: f64, height: f64) {
        let clamp = |v: f64| -> u64 {
            if v.is_finite() {
                v.round().clamp(0.0, 65_535.0) as u64
            } else {
                0
            }
        };
        let packed = (clamp(x) << 48) | (clamp(y) << 32) | (clamp(width) << 16) | clamp(height);
        self.rect.store(packed, Ordering::Relaxed);
    }

    fn overlay(&self) -> Option<HWND> {
        match self.overlay.load(Ordering::Relaxed) {
            0 => None,
            raw => Some(HWND(raw as *mut c_void)),
        }
    }

    /// オーバーレイを最大化ボタンへ重ね直す。
    ///
    /// フロントが知らせてくるのは CSS ピクセル。物理ピクセルへ揃えるのはここだけで、
    /// あとは Windows の座標系で完結する。
    ///
    /// **`SWP_ASYNCWINDOWPOS` を付ける。** `set_target` は IPC のスレッドから来るので、
    /// UI スレッドが持つウィンドウを同期で動かそうとすると待たされうる。
    fn reposition(&self, parent: HWND) {
        let Some(overlay) = self.overlay() else {
            return;
        };

        let (x, y, width, height) = self.rect();
        if width <= 0.0 || height <= 0.0 {
            // まだ場所を知らない。見せない（見当違いの場所を覆わないため）。
            let _ = unsafe { ShowWindow(overlay, SW_HIDE) };
            return;
        }

        let dpi = unsafe { GetDpiForWindow(parent) };
        let scale = if dpi == 0 {
            1.0
        } else {
            f64::from(dpi) / BASE_DPI
        };
        let px = |v: f64| (v * scale).round() as i32;

        let _ = unsafe {
            SetWindowPos(
                overlay,
                Some(HWND_TOP),
                px(x),
                px(y),
                px(width),
                px(height),
                SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
        };
    }

    /// ホバー状態が変わったときだけフロントへ流す。
    fn set_hovered(&self, overlay: HWND, now: bool) {
        if self.hovered.swap(now, Ordering::Relaxed) == now {
            return;
        }
        if now {
            track_leave(overlay);
        }
        let _ = self.window.emit(EVENT_MAXIMIZE_HOVER, now);
    }
}

/// ウィンドウの外へ出たことを知らせてもらう。
///
/// 非クライアント領域から**ウィンドウごと**出た場合、`WM_NCMOUSEMOVE` は
/// もう飛んでこない。これを頼まないと、塗ったままのボタンが残る。
fn track_leave(hwnd: HWND) {
    let mut tme = TRACKMOUSEEVENT {
        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
        dwFlags: TME_LEAVE | TME_NONCLIENT,
        hwndTrack: hwnd,
        dwHoverTime: 0,
    };
    let _ = unsafe { TrackMouseEvent(&mut tme) };
}

/// 矩形の**受け皿**を置く。**ウィンドウを作った直後、`setup()` の中で呼ぶ。**
///
/// # なぜオーバーレイの作成と分けるのか
///
/// 作成（`install`）は `ready` まで待たされる。`hwnd()` がイベントループへの
/// 問い合わせだからで、これは動かせない。
///
/// 一方、矩形を送ってくるフロントは `set_snap_layouts_target` を **1 度しか投げない**。
/// 以後は**ウィンドウ幅が変わったときしか**投げ直さない
/// （`src/app/window.ts` の `reportSnapLayoutsTarget` と `trackSnapLayoutsTarget`）。
/// その 1 度を受け損ねると、矩形は 0 のままになる。
///
/// **受け皿だけならイベントループを必要としない。先に置いておけば取りこぼさない。**
pub fn prepare(app: &tauri::AppHandle, window: &WebviewWindow) {
    if tauri::Manager::try_state::<Arc<SnapTarget>>(app).is_some() {
        return;
    }

    tauri::Manager::manage(
        app,
        Arc::new(SnapTarget {
            rect: AtomicU64::new(0),
            hovered: AtomicBool::new(false),
            pressed: AtomicBool::new(false),
            installed: AtomicBool::new(false),
            overlay: AtomicIsize::new(0),
            window: window.clone(),
        }),
    );
}

/// オーバーレイを作る。**失敗しても呼び出し側は気にしなくてよい。**
///
/// **`setup()` から呼んではいけない。** `hwnd()` はイベントループへ問い合わせる
/// ゲッターで、ループが回り出す前は答えが返らない（実測で失敗した）。
/// `ready` コマンドの中、`show()` の後に呼ぶこと。ここでやるのは Win32 の
/// 呼び出し数回だけで、本文が読める瞬間に間に合う必要も無い
/// （02.architecture/05-startup-sequence.md §1 の判断基準）。
pub fn install(app: &tauri::AppHandle) {
    let Some(state) = tauri::Manager::try_state::<Arc<SnapTarget>>(app) else {
        // `prepare` が呼ばれていない。ここで作ると、それまでに届いた矩形を
        // 捨てたことになるので、黙って諦めるほうが分かりやすい。
        eprintln!("[marxdown] Snap Layouts: 受け皿が無いので諦める");
        return;
    };
    let target = state.inner().clone();

    // 二重に作らない。作り直すと、前の参照が誰にも落とされずに残る。
    if target.installed.swap(true, Ordering::Relaxed) {
        return;
    }

    let Ok(parent) = target.window.hwnd() else {
        target.installed.store(false, Ordering::Relaxed);
        eprintln!("[marxdown] Snap Layouts: HWND を取得できないので諦める");
        return;
    };

    register_class();

    // プロシージャへ渡す参照。オーバーレイの `WM_NCDESTROY` で `Arc::from_raw` して落とす。
    let raw = Arc::into_raw(Arc::clone(&target)) as *const c_void;

    // **`WS_VISIBLE` を付けない。** 矩形が届いて `reposition` が呼ぶまで見せない。
    let created = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE(0),
            OVERLAY_CLASS,
            PCWSTR::null(),
            WS_CHILD | WS_CLIPSIBLINGS,
            0,
            0,
            0,
            0,
            Some(parent),
            None,
            None,
            Some(raw),
        )
    };

    let Ok(overlay) = created else {
        drop(unsafe { Arc::from_raw(raw as *const SnapTarget) });
        target.installed.store(false, Ordering::Relaxed);
        eprintln!("[marxdown] Snap Layouts: オーバーレイを作れないので諦める");
        return;
    };

    target.overlay.store(overlay.0 as isize, Ordering::Relaxed);

    // 親のサイズ変更に位置を追わせる。
    //
    // フロントも `resize` で測り直して投げてくるが、あちらは 120ms のデバウンスが
    // 掛かっている。**最大化した瞬間にボタンの下からオーバーレイがずれる**のを
    // 見せないために、こちらでも即座に追う。
    let parent_raw = Arc::into_raw(Arc::clone(&target)) as usize;
    let followed =
        unsafe { SetWindowSubclass(parent, Some(parent_proc), PARENT_SUBCLASS_ID, parent_raw) };
    if !followed.as_bool() {
        drop(unsafe { Arc::from_raw(parent_raw as *const SnapTarget) });
        eprintln!("[marxdown] Snap Layouts: 位置の追従だけ諦める（フライアウトは出る）");
    }

    target.reposition(parent);
}

/// 最大化ボタンの矩形（CSS px）を覚える。フロントのレイアウトが変わるたびに呼ばれる。
///
/// **オーバーレイが出来る前に届く。** それが普通の順序であり、取りこぼさないために
/// `prepare` が受け皿を先に置いてある。
pub fn set_target(app: &tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) {
    // `prepare` に失敗していれば `manage` されていない。黙って捨てる。
    let Some(target) = tauri::Manager::try_state::<Arc<SnapTarget>>(app) else {
        return;
    };

    target.store_rect(x, y, width, height);

    if let Some(overlay) = target.overlay() {
        if let Ok(parent) = unsafe { GetParent(overlay) } {
            target.reposition(parent);
        }
    }
}

/// オーバーレイのウィンドウクラス。**1 回だけ登録する。**
fn register_class() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let instance = unsafe { GetModuleHandleW(None) }.unwrap_or_default();
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(overlay_proc),
            hInstance: instance.into(),
            // 塗らせない。背景ブラシがあると本文の上に穴が空く。
            hbrBackground: HBRUSH(unsafe { GetStockObject(NULL_BRUSH) }.0),
            lpszClassName: OVERLAY_CLASS,
            ..Default::default()
        };
        unsafe { RegisterClassExW(&class) };
    });
}

/// オーバーレイのウィンドウプロシージャ。**ここが Snap Layouts の本体**。
unsafe extern "system" fn overlay_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // `CreateWindowExW` に渡した参照を、いちばん最初のメッセージで受け取る。
    if msg == WM_NCCREATE {
        let create = lparam.0 as *const CREATESTRUCTW;
        if !create.is_null() {
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (*create).lpCreateParams as isize);
        }
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }

    let data = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
    if data == 0 {
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
    let target = &*(data as *const SnapTarget);

    match msg {
        // **これ 1 行のためにこのウィンドウが在る。**
        // カーソル直下の最も深いウィンドウがここになり、シェルがフライアウトを出す。
        WM_NCHITTEST => LRESULT(HTMAXBUTTON as isize),

        WM_NCMOUSEMOVE => {
            target.set_hovered(hwnd, true);
            LRESULT(0)
        }

        WM_NCMOUSELEAVE => {
            target.set_hovered(hwnd, false);
            target.pressed.store(false, Ordering::Relaxed);
            LRESULT(0)
        }

        // 押し下げは飲み込む。既定に渡すと、Windows が「最大化ボタンを押した」
        // 描画（自前のタイトルバーには存在しない）を始めてしまう。
        WM_NCLBUTTONDOWN => {
            target.pressed.store(true, Ordering::Relaxed);
            LRESULT(0)
        }

        WM_NCLBUTTONUP => {
            if target.pressed.swap(false, Ordering::Relaxed) {
                if let Ok(parent) = GetParent(hwnd) {
                    let command = if IsZoomed(parent).as_bool() {
                        SC_RESTORE
                    } else {
                        SC_MAXIMIZE
                    };
                    // Windows 自身が本物のキャプションボタンでやるのと同じ経路を通す。
                    // tao の状態管理も、この先の `WM_SIZE` で普段どおり追従する。
                    let _ = PostMessageW(
                        Some(parent),
                        WM_SYSCOMMAND,
                        WPARAM(command as usize),
                        LPARAM(0),
                    );
                }
            }
            LRESULT(0)
        }

        // **塗らない。** 塗ると、WebView が描いた最大化ボタンの上に穴が空く。
        WM_ERASEBKGND => LRESULT(1),

        WM_NCDESTROY => {
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            let result = DefWindowProcW(hwnd, msg, wparam, lparam);
            // 参照を外した後に落とす。外す前に落とすと、
            // 後続のメッセージが解放済みの参照を引く。
            drop(Arc::from_raw(data as *const SnapTarget));
            result
        }

        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// 親のサブクラス。**位置の追従にしか使わない。**
unsafe extern "system" fn parent_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    data: usize,
) -> LRESULT {
    let target = &*(data as *const SnapTarget);

    match msg {
        WM_SIZE | WM_DPICHANGED => {
            target.reposition(hwnd);
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }

        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(parent_proc), PARENT_SUBCLASS_ID);
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            // チェーンから外した後に落とす。外す前に落とすと、
            // 後続のメッセージが解放済みの参照を引く。
            drop(Arc::from_raw(data as *const SnapTarget));
            result
        }

        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}
