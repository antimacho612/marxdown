//! Windows の Snap Layouts（最大化ボタンにホバーすると出るレイアウト選択）。
//!
//! `decorations: false`（`window.rs`）にすると、Windows は最大化ボタンの位置情報を持たない。
//! Snap Layouts のフライアウトは「`WM_NCHITTEST` に `HTMAXBUTTON` を返す矩形」に対して表示されるため、自前のタイトルバーでは自分で応答しないと表示されない。
//! `Win+←` などキーボードによるスナップは装飾を切っても機能する（`WS_THICKFRAME` と `WS_MAXIMIZEBOX` が残るため）。
//! ここで補うのはマウスでの Snap Layouts だけである。
//!
//! 親ウィンドウを `SetWindowSubclass` して `WM_NCHITTEST` に `HTMAXBUTTON` を返すだけでは、Microsoft の手順どおりでもフライアウトは表示されない。
//! クライアント領域全体を WebView2 の子ウィンドウが覆っているためである。
//! シェルがフライアウトの判定に使うのはカーソル直下の最も深いウィンドウのヒットテストであり、そこに位置するのは WebView2 の子（`HTCLIENT` を返す）である。
//! 親が返す `HTMAXBUTTON` は自分あてのマウスメッセージの経路を変えるだけで、シェルの判定対象には含まれない。
//!
//! HACK: 最大化ボタンとぴったり重なる `WS_CHILD` を 1 枚作り、そのウィンドウ自身が `WM_NCHITTEST` に `HTMAXBUTTON` を返す。
//! これでカーソル直下の最も深いウィンドウが `HTMAXBUTTON` を返す状態になり、シェルがフライアウトを表示する。
//! Tauri 向けの既存実装（`tauri-plugin-frame` / `tauri-plugin-decoration`）も同じ形を採っている。
//! Tauri 本体はこの経路を提供していない（tauri#4531）。
//!
//! このモジュールが無くても他の機能は全部動く。
//! 失敗したら何もしないで戻る（`install` の返り値は無視してよい）。
//! そのときに起きるのは「最大化ボタンにホバーしてもフライアウトが表示されない」ことだけで、ボタン自体はフロントの `<button>` として通常どおり押せる。
//!
//! 実装の要点は次のとおりである。
//! オーバーレイは矩形が届くまで表示しない（`WS_VISIBLE` を付けずに作成する。壊れたときの最悪の結果を「フライアウトが表示されない」に限定し、「見当違いの場所が押せなくなる」を防ぐため）。
//! 背景は描画しない（`WM_ERASEBKGND` で 1 を返す。描画すると本文の表示が隠れてしまう。WebView2 は DirectComposition で描画するため、入力だけを受け取る透明な板として重ねられる）。
//! ウィンドウ操作は Tauri を経由せず `WM_SYSCOMMAND` を送る（ウィンドウプロシージャの中から Tauri の同期 API を呼ぶと、イベントループが再入することになるため）。
//! 上端 4px はオーバーレイに届かない（親ウィンドウが先に `HTTOP`、リサイズ縁を返すためで、これは Windows 標準のタイトルバーと同じ挙動である）。
//!
//! ホバー時の描画が自前で必要になるのは、オーバーレイが被った領域には WebView のマウスイベントが届かず、CSS の `:hover` が機能しなくなるためである。
//! 最大化ボタンだけ反応しないのは目立つため、出入りしたときだけ `marxdown://maximize-hover` を送ってフロント側に描画させる。
//! クリックも同じ理由で `onclick` が発火しない（キーボードからは通常どおり発火する）。
#![cfg(windows)]

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Once};

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

/// 最大化ボタンのホバー状態（ペイロードは `bool`）。出入りしたときだけ通知する。
pub const EVENT_MAXIMIZE_HOVER: &str = "marxdown://maximize-hover";

/// オーバーレイのウィンドウクラス名。
const OVERLAY_CLASS: PCWSTR = w!("MarxdownSnapOverlay");

/// 親に付けるサブクラスの識別子。位置の追従にしか使わない。
const PARENT_SUBCLASS_ID: usize = 0x6d78_0001; // "mx" + 連番

/// 論理ピクセルの既定 DPI。`GetDpiForWindow` の返り値をこれで割ると倍率になる。
const BASE_DPI: f64 = 96.0;

/// 最大化ボタンの居場所と、いまホバーしているか。
///
/// ウィンドウプロシージャ（オーバーレイの `GWLP_USERDATA` と親のサブクラスの `dwRefData`）と IPC コマンドの 3 か所から参照するため `Arc` で保持する。
/// 中身はロックを取らない。
/// プロシージャの中で待機してよいものは何も無い（UI スレッドが停止する）。
pub struct SnapTarget {
    /// 矩形（CSS px）。x / y / w / h を 16bit ずつ詰めてある。
    /// 幅か高さが 0 なら「まだ知らない」。
    rect: AtomicU64,
    hovered: AtomicBool,
    /// オーバーレイの上で押し下げたか。
    /// 押した場所と離した場所が一致したときだけ最大化する（Windows の標準の挙動）。
    pressed: AtomicBool,
    /// オーバーレイを作り終えたか。
    /// 受け皿の生成（`prepare`）と作成（`install`）が別のタイミングであるため、状態の有無では代用できない。
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
    /// フロントが通知してくるのは CSS ピクセルである。
    /// 物理ピクセルへ変換するのはここだけで、あとは Windows の座標系で完結する。
    ///
    /// `SWP_ASYNCWINDOWPOS` を付ける。
    /// `set_target` は IPC のスレッドから呼ばれるため、UI スレッドが持つウィンドウを同期で移動しようとすると待たされる可能性がある。
    fn reposition(&self, parent: HWND) {
        let Some(overlay) = self.overlay() else {
            return;
        };

        let (x, y, width, height) = self.rect();
        if width <= 0.0 || height <= 0.0 {
            // まだ位置が確定していない。誤った場所を覆わないよう非表示にする。
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

    /// ホバー状態が変わったときだけフロントへ通知する。
    ///
    /// 宛先はこのオーバーレイが属するウィンドウ 1 枚に限る。
    /// `emit` は全ウィンドウへ配るため、ウィンドウが複数あるときに使うと、ホバーしていない側の最大化ボタンまで反応する。
    fn set_hovered(&self, overlay: HWND, now: bool) {
        if self.hovered.swap(now, Ordering::Relaxed) == now {
            return;
        }
        if now {
            track_leave(overlay);
        }
        let _ = self
            .window
            .emit_to(self.window.label(), EVENT_MAXIMIZE_HOVER, now);
    }
}

/// ウィンドウごとの受け皿（F-OPEN-06）。
///
/// 1 つの `SnapTarget` をプロセスで共有することはできない。
/// オーバーレイは親ウィンドウの子として作られるため、ウィンドウの枚数だけ必要になる。
#[derive(Default)]
struct SnapTargets(Mutex<HashMap<String, Arc<SnapTarget>>>);

impl SnapTargets {
    fn get(app: &tauri::AppHandle, label: &str) -> Option<Arc<SnapTarget>> {
        let targets = tauri::Manager::try_state::<SnapTargets>(app)?;
        let map = targets.0.lock().ok()?;
        map.get(label).cloned()
    }
}

/// ウィンドウの外へ出たことを知らせてもらう。
///
/// 非クライアント領域からウィンドウの外へ出た場合、`WM_NCMOUSEMOVE` は発火しなくなる。
/// これを要求しないと、ホバー表示が残ったままになる。
fn track_leave(hwnd: HWND) {
    let mut tme = TRACKMOUSEEVENT {
        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
        dwFlags: TME_LEAVE | TME_NONCLIENT,
        hwndTrack: hwnd,
        dwHoverTime: 0,
    };
    let _ = unsafe { TrackMouseEvent(&mut tme) };
}

/// 矩形の受け皿を置く。ウィンドウを作った直後、`setup()` の中で呼ぶ。
///
/// オーバーレイの作成とは分けてある。
/// 作成（`install`）は `hwnd()` がイベントループへの問い合わせであるため `ready` まで待つ必要があり、この順序は変えられない。
/// 一方、矩形を送信するフロントは `set_snap_layouts_target` を 1 度しか呼ばず、以後はウィンドウ幅が変わったときしか送り直さない（`src/app/window.ts` の `reportSnapLayoutsTarget` と `trackSnapLayoutsTarget`）。
/// その 1 度を受け取れないと矩形は 0 のままになる。
/// 受け皿だけならイベントループを必要としないため、先に用意しておけば取りこぼさない。
pub fn prepare(app: &tauri::AppHandle, window: &WebviewWindow) {
    if tauri::Manager::try_state::<SnapTargets>(app).is_none() {
        tauri::Manager::manage(app, SnapTargets::default());
    }

    let Some(targets) = tauri::Manager::try_state::<SnapTargets>(app) else {
        return;
    };
    let Ok(mut map) = targets.0.lock() else {
        return;
    };

    map.entry(window.label().to_owned()).or_insert_with(|| {
        Arc::new(SnapTarget {
            rect: AtomicU64::new(0),
            hovered: AtomicBool::new(false),
            pressed: AtomicBool::new(false),
            installed: AtomicBool::new(false),
            overlay: AtomicIsize::new(0),
            window: window.clone(),
        })
    });
}

/// 閉じたウィンドウの受け皿を解放する。
///
/// オーバーレイ自体は親ウィンドウと一緒に破棄され、`WM_NCDESTROY` がプロシージャ側の参照も解放する。
/// ここで解放するのは表に残る `Arc` だけである。残すとウィンドウを開き閉じするたびに `WebviewWindow` の参照が増え続ける（N-PERF-06）。
pub fn forget(app: &tauri::AppHandle, label: &str) {
    let Some(targets) = tauri::Manager::try_state::<SnapTargets>(app) else {
        return;
    };
    let Ok(mut map) = targets.0.lock() else {
        return;
    };
    map.remove(label);
}

/// オーバーレイを作る。失敗しても呼び出し側で対処する必要はない。
///
/// `setup()` から呼んではいけない。
/// `hwnd()` はイベントループへ問い合わせるゲッターであり、ループが動き出す前は結果が返らない。
/// `ready` コマンドの中、`show()` の後に呼ぶこと。
/// ここで行うのは Win32 の呼び出し数回だけであり、本文が読める時点に間に合う必要もない（02.architecture/05-startup-sequence.md §2 の判断基準）。
pub fn install(app: &tauri::AppHandle, label: &str) {
    let Some(target) = SnapTargets::get(app, label) else {
        // `prepare` が呼ばれていない。
        // ここで作るとそれまでに届いた矩形を破棄することになるため、何もせずに戻る。
        eprintln!("[marxdown] Snap Layouts: 受け皿が無いので諦める（{label}）");
        return;
    };

    // 二重に作らない。作り直すと、前の参照が解放されずに残る。
    if target.installed.swap(true, Ordering::Relaxed) {
        return;
    }

    let Ok(parent) = target.window.hwnd() else {
        target.installed.store(false, Ordering::Relaxed);
        eprintln!("[marxdown] Snap Layouts: HWND を取得できないので諦める");
        return;
    };

    register_class();

    // プロシージャへ渡す参照。オーバーレイの `WM_NCDESTROY` で `Arc::from_raw` して解放する。
    let raw = Arc::into_raw(Arc::clone(&target)) as *const c_void;

    // `WS_VISIBLE` を付けない。矩形が届いて `reposition` が呼ばれるまでは表示しない。
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
    // フロントも `resize` で測り直して送信するが、そちらには 120ms のデバウンスが掛かっている。
    // 最大化した瞬間にオーバーレイがボタンの位置からずれるのを避けるため、ここでも即座に追従する。
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
/// オーバーレイの作成前に届くのが通常の順序であり、取りこぼさないために `prepare` が受け皿を先に用意してある。
pub fn set_target(app: &tauri::AppHandle, label: &str, x: f64, y: f64, width: f64, height: f64) {
    // `prepare` に失敗していれば表に無い。この場合は何もしない。
    let Some(target) = SnapTargets::get(app, label) else {
        return;
    };

    target.store_rect(x, y, width, height);

    if let Some(overlay) = target.overlay() {
        if let Ok(parent) = unsafe { GetParent(overlay) } {
            target.reposition(parent);
        }
    }
}

/// オーバーレイのウィンドウクラス。1 回だけ登録する。
fn register_class() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let instance = unsafe { GetModuleHandleW(None) }.unwrap_or_default();
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(overlay_proc),
            hInstance: instance.into(),
            // 背景ブラシがあると本文の描画が隠れるため、描画させない。
            hbrBackground: HBRUSH(unsafe { GetStockObject(NULL_BRUSH) }.0),
            lpszClassName: OVERLAY_CLASS,
            ..Default::default()
        };
        unsafe { RegisterClassExW(&class) };
    });
}

/// オーバーレイのウィンドウプロシージャ。Snap Layouts の本体にあたる。
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
        // このウィンドウはこの応答のためだけに存在する。
        // カーソル直下の最も深いウィンドウがここになり、シェルがフライアウトを表示する。
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

        // 押し下げはここで処理を終える。
        // 既定の処理に渡すと、Windows が最大化ボタンの押下描画（自前のタイトルバーには存在しない）を開始してしまう。
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
                    // Windows が本来のキャプションボタンで使うのと同じ経路を通す。
                    // tao の状態管理も、この後の `WM_SIZE` で通常どおり追従する。
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

        // 描画すると WebView が描いた最大化ボタンの表示が隠れるため、何もしない。
        WM_ERASEBKGND => LRESULT(1),

        WM_NCDESTROY => {
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            let result = DefWindowProcW(hwnd, msg, wparam, lparam);
            // 参照を外した後に解放する。
            // 外す前に解放すると、後続のメッセージが解放済みの参照を辿ることになる。
            drop(Arc::from_raw(data as *const SnapTarget));
            result
        }

        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// 親のサブクラス。位置の追従にしか使わない。
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
            // チェーンから外した後に解放する。
            // 外す前に解放すると、後続のメッセージが解放済みの参照を辿ることになる。
            drop(Arc::from_raw(data as *const SnapTarget));
            result
        }

        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}
