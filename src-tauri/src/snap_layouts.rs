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
//! # このモジュールは無くても他が全部動く
//!
//! 失敗したら何もしないで戻る（`install` の返り値は無視してよい）。
//! そのときに起きるのは「最大化ボタンにホバーしてもフライアウトが出ない」ことだけで、
//! ボタンそのものはフロントの `<button>` として今までどおり押せる。
//! 06.roadmap/m1.5-shell-and-settings.md §2 が残している C（Windows のオーバーレイ API）への
//! 逃げ道も、このモジュールを消すだけで開く。
//!
//! # 実装の要点
//!
//! - **tao のサブクラスより後に**自分のサブクラスを付ける。Windows の
//!   サブクラスチェーンは後から付けたものが先に呼ばれる
//! - `WM_NCHITTEST` は**まず `DefSubclassProc` に聞く**。tao がリサイズ縁の
//!   当たり判定を返すので、縁のほうを優先しないと上端でリサイズできなくなる
//! - ボタンの矩形はフロントが `set_snap_layouts_target` で知らせる。
//!   ウィンドウ幅で位置が変わるため、レイアウトを知っているのはあちらだけ
//! - 矩形が届く前は**何もしない**。壊れたときの最悪が「フライアウトが出ない」に
//!   留まり、「最大化ボタンが押せない」にならないようにする
//! - ウィンドウ操作は Tauri を経由せず `WM_SYSCOMMAND` を投げる。
//!   ウィンドウプロシージャの中から Tauri の同期 API を呼ぶと、
//!   イベントループへ入れ子で入ることになる
//!
//! # ホバーの塗りが自前で要る理由
//!
//! `HTMAXBUTTON` を返した領域は**非クライアント領域**になり、WebView に
//! マウスイベントが届かない。つまり CSS の `:hover` が効かなくなる。
//! 最大化ボタンだけ反応しないのは目立つので、出入りしたときだけ
//! `marxdown://maximize-hover` を流してフロントに塗らせる。
#![cfg(windows)]

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use tauri::{Emitter, WebviewWindow};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT,
};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    IsZoomed, PostMessageW, HTCLIENT, HTMAXBUTTON, SC_MAXIMIZE, SC_RESTORE, WM_NCDESTROY,
    WM_NCHITTEST, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_SYSCOMMAND,
};

/// 最大化ボタンのホバー状態（ペイロードは `bool`）。**出入りしたときだけ**流す。
pub const EVENT_MAXIMIZE_HOVER: &str = "marxdown://maximize-hover";

/// サブクラスの識別子。同じウィンドウに複数付けたときの区別に使う。
const SUBCLASS_ID: usize = 0x6d78_0001; // "mx" + 連番

/// 論理ピクセルの既定 DPI。`GetDpiForWindow` の返り値をこれで割ると倍率になる。
const BASE_DPI: f64 = 96.0;

/// 最大化ボタンの居場所と、いまホバーしているか。
///
/// ウィンドウプロシージャ（サブクラスの `dwRefData`）と IPC コマンドの
/// 両方から触るので `Arc` で持つ。中身はロックを取らない。
/// **プロシージャの中で待てるものは何も無い**（UI スレッドを止める）。
pub struct SnapTarget {
    /// 矩形（論理 px）。x / y / w / h を 16bit ずつ詰めてある。
    /// 幅か高さが 0 なら「まだ知らない」。
    rect: AtomicU64,
    hovered: AtomicBool,
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

    /// `WM_NCHITTEST` の座標（スクリーン）がボタンの上か。
    fn covers(&self, hwnd: HWND, lparam: LPARAM) -> bool {
        let (x, y, width, height) = self.rect();
        if width <= 0.0 || height <= 0.0 {
            return false;
        }

        let mut point = POINT {
            x: (lparam.0 & 0xffff) as i16 as i32,
            y: ((lparam.0 >> 16) & 0xffff) as i16 as i32,
        };
        // 最大化中と通常時ではクライアント原点が違う（`window.rs` の表を参照）。
        // 変換を Windows に任せておけば、その差を自分で持たなくてよい。
        if !unsafe { ScreenToClient(hwnd, &mut point) }.as_bool() {
            return false;
        }

        // フロントが知らせてくるのは CSS ピクセル。物理ピクセルへ揃える。
        let dpi = unsafe { GetDpiForWindow(hwnd) };
        let scale = if dpi == 0 {
            1.0
        } else {
            f64::from(dpi) / BASE_DPI
        };
        let cx = f64::from(point.x) / scale;
        let cy = f64::from(point.y) / scale;

        cx >= x && cx < x + width && cy >= y && cy < y + height
    }

    /// ホバー状態が変わったときだけフロントへ流す。
    fn set_hovered(&self, hwnd: HWND, now: bool) {
        if self.hovered.swap(now, Ordering::Relaxed) == now {
            return;
        }
        if now {
            track_leave(hwnd);
        }
        let _ = self.window.emit(EVENT_MAXIMIZE_HOVER, now);
    }
}

/// ウィンドウの外へ出たことを知らせてもらう。
///
/// 非クライアント領域から**ウィンドウごと**出た場合、`WM_NCHITTEST` は
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

/// サブクラスを付ける。**失敗しても呼び出し側は気にしなくてよい。**
///
/// **`setup()` から呼んではいけない。** `hwnd()` はイベントループへ問い合わせる
/// ゲッターで、ループが回り出す前は答えが返らない（実測で失敗した）。
/// `ready` コマンドの中、`show()` の後に呼ぶこと。ここでやるのは Win32 の
/// 呼び出し 1 回だけで、本文が読める瞬間に間に合う必要も無い
/// （02.architecture/05-startup-sequence.md §1 の判断基準）。
pub fn install(app: &tauri::AppHandle, window: &WebviewWindow) {
    // 二重に付けない。付け直すと、前の参照が誰にも落とされずに残る。
    if tauri::Manager::try_state::<Arc<SnapTarget>>(app).is_some() {
        return;
    }

    let Ok(hwnd) = window.hwnd() else {
        eprintln!("[marxdown] Snap Layouts: HWND を取得できないので諦める");
        return;
    };

    let target = Arc::new(SnapTarget {
        rect: AtomicU64::new(0),
        hovered: AtomicBool::new(false),
        window: window.clone(),
    });

    // プロシージャへ渡す参照。`WM_NCDESTROY` で `Arc::from_raw` して落とす。
    let raw = Arc::into_raw(Arc::clone(&target)) as usize;
    let installed = unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, raw) };

    if !installed.as_bool() {
        // 参照を戻して捨てる。付いていないのに生き続ける理由がない。
        drop(unsafe { Arc::from_raw(raw as *const SnapTarget) });
        eprintln!("[marxdown] Snap Layouts: サブクラス化に失敗したので諦める");
        return;
    }

    tauri::Manager::manage(app, target);
}

/// 最大化ボタンの矩形（論理 px）を覚える。フロントのレイアウトが変わるたびに呼ばれる。
pub fn set_target(app: &tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) {
    // サブクラス化に失敗していれば `manage` されていない。黙って捨てる。
    if let Some(target) = tauri::Manager::try_state::<Arc<SnapTarget>>(app) {
        target.store_rect(x, y, width, height);
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    data: usize,
) -> LRESULT {
    let target = &*(data as *const SnapTarget);

    match msg {
        WM_NCHITTEST => {
            // **先に既定へ聞く。** tao がリサイズ縁を返すので、そちらを優先する。
            // ここを逆にすると、ボタンと上端が重なる 1〜2px でリサイズできなくなる。
            let hit = DefSubclassProc(hwnd, msg, wparam, lparam);
            if hit.0 != HTCLIENT as isize {
                return hit;
            }

            let over = target.covers(hwnd, lparam);
            target.set_hovered(hwnd, over);
            if over {
                LRESULT(HTMAXBUTTON as isize)
            } else {
                hit
            }
        }

        WM_NCMOUSELEAVE => {
            target.set_hovered(hwnd, false);
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }

        // 押し下げは飲み込む。既定に渡すと、Windows が「最大化ボタンを押した」
        // 描画（自前のタイトルバーには存在しない）を始めてしまう。
        WM_NCLBUTTONDOWN if wparam.0 as u32 == HTMAXBUTTON => LRESULT(0),

        WM_NCLBUTTONUP if wparam.0 as u32 == HTMAXBUTTON => {
            let command = if IsZoomed(hwnd).as_bool() {
                SC_RESTORE
            } else {
                SC_MAXIMIZE
            };
            // Windows 自身が本物のキャプションボタンでやるのと同じ経路を通す。
            // tao の状態管理も、この先の `WM_SIZE` で普段どおり追従する。
            let _ = PostMessageW(
                Some(hwnd),
                WM_SYSCOMMAND,
                WPARAM(command as usize),
                LPARAM(0),
            );
            LRESULT(0)
        }

        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            // チェーンから外した後に落とす。外す前に落とすと、
            // 後続のメッセージが解放済みの参照を引く。
            drop(Arc::from_raw(data as *const SnapTarget));
            result
        }

        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}
