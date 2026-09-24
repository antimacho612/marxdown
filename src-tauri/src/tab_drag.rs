//! タブを窓の外へドラッグしている間の状態と、落とした先の判定（OQ-43 / ADR-0017）。
//!
//! ドラッグを追っているのは引き出した側のウィンドウだけである。
//! ポインタを捕捉しているため、窓の外へ出た後もポインタイベントはそのウィンドウにしか届かない。
//! 下にある他のウィンドウは何も受け取らないので、どのウィンドウの上にいるかの判定と、そのウィンドウへの強調の指示はここが担う。

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// 他のウィンドウの上にタブが来た / 離れた（ペイロードは `bool`）。宛先はそのウィンドウ 1 枚に限る。
pub const EVENT_TAB_DRAG_OVER: &str = "marxdown://tab-drag-over";

/// カーソルに追従する表示の配色（sRGB）。
///
/// 配色のトークンを解決するのはフロントである。
/// 利用者の配色（`themes/`）はどの CSS の色表記でも書けるため、Rust 側で解釈しない。
#[derive(Debug, Default, Clone, Copy, Deserialize)]
pub struct GhostColors {
    pub background: [u8; 3],
    pub foreground: [u8; 3],
    pub border: [u8; 3],
}

/// 進行中のドラッグ。ポインタは 1 つなので、プロセス全体で同時に 1 つしか無い。
#[derive(Default)]
pub struct TabDrag(Mutex<Option<Session>>);

struct Session {
    /// 引き出した側のウィンドウ。落とした先の候補から除く。
    source: String,
    /// いま下にある他のウィンドウ。強調を付けている先でもある。
    over: Option<String>,
}

impl TabDrag {
    /// ドラッグを始める。
    ///
    /// 前のドラッグが終わらないまま始まることがある（ポインタの捕捉を失った場合など）。
    /// そのとき残っている強調はここで外す。
    pub fn begin<R: Runtime>(&self, app: &AppHandle<R>, source: &str) {
        let stale = self.0.lock().ok().and_then(|mut guard| {
            guard.replace(Session {
                source: source.to_owned(),
                over: None,
            })
        });
        if let Some(label) = stale.and_then(|session| session.over) {
            notify(app, &label, false);
        }
    }

    /// カーソルの下にある他のウィンドウを調べ直す。変わったときだけ強調を付け替える。
    ///
    /// ポインタが動くたびに呼ばれる。
    /// 変わっていなければイベントを送らない。
    pub fn hover<R: Runtime>(&self, app: &AppHandle<R>) {
        let Some(source) = self.source() else {
            return;
        };
        let now = window_under_cursor(app, &source);

        let previous = {
            let Ok(mut guard) = self.0.lock() else {
                return;
            };
            let Some(session) = guard.as_mut() else {
                return;
            };
            if session.over == now {
                return;
            }
            std::mem::replace(&mut session.over, now.clone())
        };

        if let Some(label) = previous {
            notify(app, &label, false);
        }
        if let Some(label) = now {
            notify(app, &label, true);
        }
    }

    /// ドラッグを終える。強調を外し、落とした先のウィンドウのラベルを返す。
    ///
    /// 他のウィンドウの上でなければ `None` を返す。
    /// 呼び出し側はその場合にサテライトを作る（`commands::open_satellite`）。
    ///
    /// `caller` は終える指示を送ってきたウィンドウである。
    /// ポインタを窓の外へ出してすぐ離すと、開始（[`TabDrag::begin`]）より先に離したことになる場合がある。
    /// そのときもカーソルの位置で判定できるよう、引き出した側として扱う。
    pub fn end<R: Runtime>(&self, app: &AppHandle<R>, caller: &str) -> Option<String> {
        let session = self.0.lock().ok().and_then(|mut guard| guard.take());
        let source = match session {
            Some(session) => {
                if let Some(label) = &session.over {
                    notify(app, label, false);
                }
                session.source
            }
            None => caller.to_owned(),
        };
        window_under_cursor(app, &source)
    }

    /// 閉じたウィンドウの分を片付ける。引き出した側が閉じた場合は `true` を返す。
    ///
    /// `true` のときは、カーソルに追従する表示を呼び出し側が消す必要がある。
    /// 表示を消す指示（`tab_drag_end`）を送る側がもう存在しないためである。
    pub fn forget(&self, label: &str) -> bool {
        let Ok(mut guard) = self.0.lock() else {
            return false;
        };
        let Some(session) = guard.as_mut() else {
            return false;
        };
        if session.source == label {
            *guard = None;
            return true;
        }
        if session.over.as_deref() == Some(label) {
            session.over = None;
        }
        false
    }

    fn source(&self) -> Option<String> {
        let guard = self.0.lock().ok()?;
        guard.as_ref().map(|session| session.source.clone())
    }
}

fn notify<R: Runtime>(app: &AppHandle<R>, label: &str, over: bool) {
    let _ = app.emit_to(label, EVENT_TAB_DRAG_OVER, over);
}

/// カーソルの下にある、このプロセスのウィンドウ。`except` は候補から除く。
///
/// Windows では `WindowFromPoint` で調べるため、重なり順が反映される。
/// 他のアプリのウィンドウが上に重なっている場所では、下に Marxdown のウィンドウがあっても `None` になる。
/// 見えていないウィンドウへタブが移ると、移ったことが分からないためである。
#[cfg(windows)]
fn window_under_cursor<R: Runtime>(app: &AppHandle<R>, except: &str) -> Option<String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetCursorPos, WindowFromPoint, GA_ROOT,
    };

    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }.ok()?;

    // 返るのはカーソル直下の最も深いウィンドウ（WebView2 の子ウィンドウ）である。
    // トップレベルまで辿ってから、各ウィンドウの `HWND` と比べる。
    let hit = unsafe { WindowFromPoint(point) };
    if hit.is_invalid() {
        return None;
    }
    let root = unsafe { GetAncestor(hit, GA_ROOT) };

    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label != except)
        .find(|(_, window)| window.hwnd().is_ok_and(|hwnd| hwnd == root))
        .map(|(label, _)| label)
}

/// Windows 以外では重なり順を調べず、矩形に入っている最初のウィンドウを返す。
#[cfg(not(windows))]
fn window_under_cursor<R: Runtime>(app: &AppHandle<R>, except: &str) -> Option<String> {
    let cursor = app.cursor_position().ok()?;

    app.webview_windows()
        .into_iter()
        .filter(|(label, window)| {
            label != except
                && window.is_visible().unwrap_or(false)
                && !window.is_minimized().unwrap_or(true)
        })
        .find(|(_, window)| {
            let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
                return false;
            };
            let left = f64::from(position.x);
            let top = f64::from(position.y);
            cursor.x >= left
                && cursor.y >= top
                && cursor.x < left + f64::from(size.width)
                && cursor.y < top + f64::from(size.height)
        })
        .map(|(label, _)| label)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dragging(source: &str, over: Option<&str>) -> TabDrag {
        TabDrag(Mutex::new(Some(Session {
            source: source.to_owned(),
            over: over.map(str::to_owned),
        })))
    }

    fn over(drag: &TabDrag) -> Option<String> {
        drag.0
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|session| session.over.clone())
    }

    #[test]
    fn closing_the_source_window_ends_the_drag() {
        let drag = dragging("main-2", Some("main"));

        assert!(drag.forget("main-2"));
        assert!(drag.source().is_none());
    }

    #[test]
    fn closing_the_window_below_only_forgets_the_highlight() {
        let drag = dragging("main-2", Some("main"));

        assert!(!drag.forget("main"));
        assert_eq!(drag.source().as_deref(), Some("main-2"));
        assert!(over(&drag).is_none());
    }

    #[test]
    fn closing_an_unrelated_window_changes_nothing() {
        let drag = dragging("main-2", Some("main"));

        assert!(!drag.forget("main-3"));
        assert_eq!(over(&drag).as_deref(), Some("main"));
    }
}
