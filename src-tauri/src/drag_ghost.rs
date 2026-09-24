//! タブを窓の外へドラッグしている間、カーソルに追従する表示（OQ-43 / ADR-0017）。
//!
//! 窓の外にはページを描けない。
//! 見た目のためだけに WebView をもう 1 枚作るのは重すぎるため、WebView を持たない Win32 のポップアップを 1 枚だけ使い、GDI でタブ名を描く。
//! 作るのは最初にドラッグしたときの 1 回だけで、以後は隠して使い回す。
//! 隠れている間は何も処理しない（アイドル時 CPU ≒ 0）。
//!
//! マウス入力は受け取らない（`WS_EX_TRANSPARENT` と、`WM_NCHITTEST` への `HTTRANSPARENT`）。
//! 落とした先の判定（`tab_drag.rs`）はカーソル直下のウィンドウを見るため、ここが入力を受け取ると常にこの表示自身が当たる。
//! 念のためカーソルの右下にずらして置き、カーソル直下には重ねない。
//!
//! 公開している関数はすべてメインスレッドで呼ぶこと（`AppHandle::run_on_main_thread`）。
//! ウィンドウは作ったスレッドのメッセージループで動くため、他のスレッドで作ると描画されない。
#![cfg(windows)]

use std::cell::RefCell;
use std::ffi::c_void;
use std::sync::Once;

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreateFontIndirectW, CreateSolidBrush, DeleteObject, DrawTextW, EndPaint, FillRect,
    FrameRect, GetDC, InvalidateRect, MonitorFromPoint, ReleaseDC, SelectObject, SetBkMode,
    SetTextColor, DT_CALCRECT, DT_END_ELLIPSIS, DT_LEFT, DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER,
    HFONT, MONITOR_DEFAULTTONEAREST, PAINTSTRUCT, TRANSPARENT,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, SystemParametersInfoForDpi, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetCursorPos, RegisterClassExW, SetLayeredWindowAttributes,
    SetWindowPos, ShowWindow, HTTRANSPARENT, HWND_TOPMOST, LWA_ALPHA, MA_NOACTIVATE,
    NONCLIENTMETRICSW, SPI_GETNONCLIENTMETRICS, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE,
    WM_ERASEBKGND, WM_MOUSEACTIVATE, WM_NCHITTEST, WM_PAINT, WNDCLASSEXW, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::tab_drag::GhostColors;

const CLASS: PCWSTR = w!("MarxdownTabGhost");

/// 論理ピクセルの既定 DPI。
const BASE_DPI: u32 = 96;

/// カーソルからずらす量（論理 px）。
const OFFSET_X: f64 = 14.0;
const OFFSET_Y: f64 = 10.0;

/// 内側の余白（論理 px）。
const PADDING_X: f64 = 10.0;
const PADDING_Y: f64 = 5.0;

/// 名前が長いときに切り詰める幅（論理 px）。タブの最大幅（`TabStrip.svelte` の `14rem`）に揃える。
const MAX_TEXT_WIDTH: f64 = 224.0;

/// 不透明度（0〜255）。
/// 下にあるものが少し透けて見えることで、置かれたものではなく運んでいるものに見える。
const ALPHA: u8 = 230;

struct Ghost {
    hwnd: HWND,
    text: Vec<u16>,
    colors: GhostColors,
    /// いまの大きさと字形を決めた DPI。0 は「まだ決めていない」。
    dpi: u32,
    font: Option<HFONT>,
    width: i32,
    height: i32,
}

thread_local! {
    /// メインスレッドでしか触らないため、ロックではなく `RefCell` で持つ。
    static GHOST: RefCell<Option<Ghost>> = const { RefCell::new(None) };
}

/// 表示する。まだ作っていなければここで作る。
///
/// 作れなければ何もしない。
/// そのときに失われるのはドラッグ中の表示だけで、落とした後の動作（サテライトを作る / 他のウィンドウへ移す）は変わらない。
pub fn show(label: &str, colors: GhostColors) {
    let ready = GHOST.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            *slot = create();
        }
        let Some(ghost) = slot.as_mut() else {
            return false;
        };
        ghost.text = label.encode_utf16().collect();
        ghost.colors = colors;
        // 名前が変わったので大きさを測り直させる。
        ghost.dpi = 0;
        true
    });
    if ready {
        follow();
    }
}

/// カーソルの位置へ動かす。表示していなければ表示する。
///
/// DPI の違うモニタへ移ったときは、字形と大きさをそのモニタに合わせて作り直す。
pub fn follow() {
    let Some(cursor) = cursor() else {
        return;
    };
    let dpi = dpi_at(cursor);

    // Win32 の呼び出しは借用を返してから行う。
    // `SetWindowPos` は同期的にメッセージを送るため、借用したままだとウィンドウプロシージャ側の借用と衝突する。
    let placement = GHOST.with(|cell| {
        let mut slot = cell.borrow_mut();
        let ghost = slot.as_mut()?;
        let relaid = ghost.dpi != dpi;
        if relaid {
            ghost.layout(dpi);
        }
        Some((ghost.hwnd, ghost.width, ghost.height, relaid))
    });
    let Some((hwnd, width, height, relaid)) = placement else {
        return;
    };

    let x = cursor.x + px(OFFSET_X, dpi);
    let y = cursor.y + px(OFFSET_Y, dpi);
    let _ = unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        )
    };
    if relaid {
        let _ = unsafe { InvalidateRect(Some(hwnd), None, false) };
    }
}

/// 隠す。作っていなければ何もしない。
pub fn hide() {
    let hwnd = GHOST.with(|cell| cell.borrow().as_ref().map(|ghost| ghost.hwnd));
    if let Some(hwnd) = hwnd {
        let _ = unsafe { ShowWindow(hwnd, SW_HIDE) };
    }
}

impl Ghost {
    /// 指定の DPI で字形を作り、名前の幅から大きさを決める。
    fn layout(&mut self, dpi: u32) {
        if let Some(font) = message_font(dpi) {
            if let Some(old) = self.font.replace(font) {
                let _ = unsafe { DeleteObject(old.into()) };
            }
        }

        let mut rect = RECT::default();
        unsafe {
            let hdc = GetDC(Some(self.hwnd));
            let previous = self.font.map(|font| SelectObject(hdc, font.into()));
            DrawTextW(
                hdc,
                &mut self.text,
                &mut rect,
                DT_CALCRECT | DT_SINGLELINE | DT_NOPREFIX,
            );
            if let Some(previous) = previous {
                SelectObject(hdc, previous);
            }
            ReleaseDC(Some(self.hwnd), hdc);
        }

        let text_width = (rect.right - rect.left).min(px(MAX_TEXT_WIDTH, dpi));
        let text_height = rect.bottom - rect.top;
        self.width = text_width + px(PADDING_X, dpi) * 2;
        self.height = text_height + px(PADDING_Y, dpi) * 2;
        self.dpi = dpi;
    }

    fn paint(&mut self, hdc: windows::Win32::Graphics::Gdi::HDC) {
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: self.width,
            bottom: self.height,
        };

        unsafe {
            let background = CreateSolidBrush(rgb(self.colors.background));
            FillRect(hdc, &rect, background);
            let _ = DeleteObject(background.into());

            // 高 DPI でも枠が細くなりすぎないよう、倍率ぶんの太さで描く。
            let border = CreateSolidBrush(rgb(self.colors.border));
            let mut frame = rect;
            for _ in 0..px(1.0, self.dpi).max(1) {
                FrameRect(hdc, &frame, border);
                frame.left += 1;
                frame.top += 1;
                frame.right -= 1;
                frame.bottom -= 1;
            }
            let _ = DeleteObject(border.into());

            let previous = self.font.map(|font| SelectObject(hdc, font.into()));
            SetBkMode(hdc, TRANSPARENT);
            SetTextColor(hdc, rgb(self.colors.foreground));
            rect.left += px(PADDING_X, self.dpi);
            rect.right -= px(PADDING_X, self.dpi);
            DrawTextW(
                hdc,
                &mut self.text,
                &mut rect,
                DT_SINGLELINE | DT_VCENTER | DT_LEFT | DT_END_ELLIPSIS | DT_NOPREFIX,
            );
            if let Some(previous) = previous {
                SelectObject(hdc, previous);
            }
        }
    }
}

fn create() -> Option<Ghost> {
    register_class();
    let instance = unsafe { GetModuleHandleW(None) }.ok()?;

    // `WS_EX_TOOLWINDOW` はタスクバーと `Alt+Tab` に出さないため。
    // `WS_EX_NOACTIVATE` は、表示しても引き出している側のウィンドウからフォーカスを奪わないため。
    let hwnd = unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
            CLASS,
            PCWSTR::null(),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.into()),
            None,
        )
    }
    .ok()?;

    let _ = unsafe { SetLayeredWindowAttributes(hwnd, COLORREF(0), ALPHA, LWA_ALPHA) };

    Some(Ghost {
        hwnd,
        text: Vec::new(),
        colors: GhostColors::default(),
        dpi: 0,
        font: None,
        width: 0,
        height: 0,
    })
}

fn register_class() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let instance = unsafe { GetModuleHandleW(None) }.unwrap_or_default();
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(ghost_proc),
            hInstance: instance.into(),
            lpszClassName: CLASS,
            ..Default::default()
        };
        unsafe { RegisterClassExW(&class) };
    });
}

unsafe extern "system" fn ghost_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        // 全面を `WM_PAINT` で塗るため、背景は消さない（ちらつきの原因になる）。
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            // 借用中（`follow` の途中）に届いた場合は描かない。
            // 借用を返した後で `follow` が無効化し直すため、描き漏れは残らない。
            GHOST.with(|cell| {
                if let Ok(mut slot) = cell.try_borrow_mut() {
                    if let Some(ghost) = slot.as_mut() {
                        ghost.paint(hdc);
                    }
                }
            });
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// OS の UI フォント（メッセージボックスと同じもの）を、指定の DPI の大きさで作る。
///
/// 日本語のファイル名を描くため、決め打ちのフォント名は使わない。
fn message_font(dpi: u32) -> Option<HFONT> {
    let mut metrics = NONCLIENTMETRICSW {
        cbSize: std::mem::size_of::<NONCLIENTMETRICSW>() as u32,
        ..Default::default()
    };
    unsafe {
        SystemParametersInfoForDpi(
            SPI_GETNONCLIENTMETRICS.0,
            metrics.cbSize,
            Some(&mut metrics as *mut NONCLIENTMETRICSW as *mut c_void),
            0,
            dpi,
        )
    }
    .ok()?;

    let font = unsafe { CreateFontIndirectW(&metrics.lfMessageFont) };
    (!font.is_invalid()).then_some(font)
}

fn cursor() -> Option<POINT> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }.ok()?;
    Some(point)
}

/// その点があるモニタの DPI。取れなければ既定の 96 を返す。
fn dpi_at(point: POINT) -> u32 {
    let monitor = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };
    let (mut x, mut y) = (0, 0);
    match unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y) } {
        Ok(()) if x > 0 => x,
        _ => BASE_DPI,
    }
}

/// 論理ピクセルを、指定の DPI の物理ピクセルへ変換する。
fn px(logical: f64, dpi: u32) -> i32 {
    (logical * f64::from(dpi) / f64::from(BASE_DPI)).round() as i32
}

fn rgb([r, g, b]: [u8; 3]) -> COLORREF {
    COLORREF(u32::from(r) | (u32::from(g) << 8) | (u32::from(b) << 16))
}
