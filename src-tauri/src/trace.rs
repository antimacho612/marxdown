//! 起動計測ハーネス（05.performance-budget/05-operations.md §2）。
//!
//! Rust 側の T0〜T3（main() 冒頭 / 引数解析完了 / ファイル読み込み完了 / ウィンドウ生成呼び出し完了）と、フロント側の T4〜T9（初期スクリプト評価開始 / bootstrap 読み取り完了 / パース開始 / パース完了 / 本文 DOM 挿入完了 + 次の rAF / window.show()）を、同一の時間軸に統一して JSON へ出力する。
//!
//! `Instant` は単調増加だがプロセス間・言語間で共有できない。
//! そこで T0 の時点の UNIX epoch ミリ秒を bootstrap でフロントへ渡し、フロント側は `performance.timeOrigin + mark.startTime - t0EpochMs` を計算して送り返す。
//! これにより両者が「T0 からの経過ミリ秒」という同じ基準で扱えるようになる。

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// 計測点 1 つ。Rust 側とフロント側の両方から積まれ、同じ時間軸に揃えて記録する。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    /// "T0".."T9"
    pub id: String,
    /// T0 からの経過ミリ秒
    pub at_ms: f64,
    /// 補足（ファイルサイズ、チャンク数など）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// 書き出す JSON の全体。マーカーは時刻順に並ぶ（[`Trace::report`]）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceReport {
    pub version: u32,
    /// "cold" | "warm"
    pub kind: String,
    pub t0_epoch_ms: f64,
    pub marks: Vec<Mark>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document: Option<TraceDocument>,
}

/// 計測対象として開いたドキュメントの情報。
/// 起動時間はファイルサイズと埋め込みの有無に左右されるため、レポートに残す。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceDocument {
    pub path: String,
    pub size: u64,
    /// bootstrap に本文ごと埋め込んだか（02.architecture/05-startup-sequence.md §1 の 256KB 閾値）
    pub inlined: bool,
}

/// 計測の状態。`--trace-startup` が無い間はすべての操作がほぼ無コストになる。
pub struct Trace {
    enabled: bool,
    out: Option<PathBuf>,
    exit_after: bool,
    t0: Instant,
    t0_epoch_ms: f64,
    marks: Mutex<Vec<Mark>>,
    document: Mutex<Option<TraceDocument>>,
}

impl Trace {
    /// `main()` の冒頭で 1 回だけ作る。これが T0 になる。
    pub fn start(t0: Instant) -> Self {
        let t0_epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0);
        Self {
            enabled: false,
            out: None,
            exit_after: false,
            t0,
            t0_epoch_ms,
            marks: Mutex::new(Vec::new()),
            document: Mutex::new(None),
        }
    }

    /// CLI 引数の解析後に設定を反映する。
    pub fn configure(&mut self, out: Option<PathBuf>, exit_after: bool) {
        self.enabled = out.is_some();
        // `nul` / `/dev/null` は計測だけ行って書き出さない。hyperfine から実行するとき用。
        self.out = out.filter(|p| {
            let s = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
            !s.eq_ignore_ascii_case("nul") && !s.eq_ignore_ascii_case("null")
        });
        self.exit_after = exit_after;
    }

    /// 計測が有効か。`--trace-startup` の指定で決まる。
    pub fn enabled(&self) -> bool {
        self.enabled
    }

    /// 書き出し後にプロセスを終了するか（`--exit-after-trace`）。
    pub fn exit_after(&self) -> bool {
        self.exit_after
    }

    /// T0 の UNIX epoch ミリ秒。フロントが自分の時刻を同じ軸へ変換するために使う。
    pub fn t0_epoch_ms(&self) -> f64 {
        self.t0_epoch_ms
    }

    /// ウォーム起動の記録先。コールド起動の出力先に `.warm.jsonl` を足したパス。
    ///
    /// ウォーム起動は 1 プロセスで何度も起きるため、1 レコード 1 行の追記形式にする。
    pub fn warm_log_path(&self) -> Option<PathBuf> {
        let out = self.out.as_ref()?;
        let mut s = out.clone().into_os_string();
        s.push(".warm.jsonl");
        Some(PathBuf::from(s))
    }

    /// Rust 側のマーカーを打つ。無効時はほぼゼロコスト。
    pub fn mark(&self, id: &str, note: Option<String>) {
        if !self.enabled {
            return;
        }
        let at_ms = self.t0.elapsed().as_secs_f64() * 1000.0;
        if let Ok(mut m) = self.marks.lock() {
            m.push(Mark {
                id: id.to_string(),
                at_ms,
                note,
            });
        }
    }

    /// フロント側から送られてきたマーカーをまとめて取り込む。
    pub fn extend(&self, marks: Vec<Mark>) {
        if !self.enabled {
            return;
        }
        if let Ok(mut m) = self.marks.lock() {
            m.extend(marks);
        }
    }

    /// 計測対象のドキュメント情報を記録する。無効時も保持するだけで副作用はない。
    pub fn set_document(&self, doc: TraceDocument) {
        if let Ok(mut d) = self.document.lock() {
            *d = Some(doc);
        }
    }

    /// レポートを組み立てる。マーカーは id 順ではなく時刻順に並べる。
    pub fn report(&self, kind: &str) -> TraceReport {
        let mut marks = self.marks.lock().map(|m| m.clone()).unwrap_or_default();
        marks.sort_by(|a, b| {
            a.at_ms
                .partial_cmp(&b.at_ms)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        TraceReport {
            version: 1,
            kind: kind.to_string(),
            t0_epoch_ms: self.t0_epoch_ms,
            marks,
            document: self.document.lock().ok().and_then(|d| d.clone()),
        }
    }

    /// JSON を書き出す。`--trace-startup nul` のときは何もしない。
    pub fn flush(&self, kind: &str) {
        if !self.enabled {
            return;
        }
        let report = self.report(kind);
        let Some(out) = self.out.as_ref() else { return };
        match serde_json::to_string_pretty(&report) {
            Ok(json) => {
                if let Some(parent) = out.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Err(e) = std::fs::write(out, json) {
                    eprintln!("[marxdown] トレースの書き出しに失敗: {e}");
                }
            }
            Err(e) => eprintln!("[marxdown] トレースの直列化に失敗: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_trace_records_nothing() {
        let t = Trace::start(Instant::now());
        t.mark("T1", None);
        assert!(t.report("cold").marks.is_empty());
    }

    #[test]
    fn marks_are_sorted_by_time_not_by_id() {
        let mut t = Trace::start(Instant::now());
        t.configure(Some(PathBuf::from("nul")), false);
        t.extend(vec![
            Mark {
                id: "T9".into(),
                at_ms: 10.0,
                note: None,
            },
            Mark {
                id: "T4".into(),
                at_ms: 90.0,
                note: None,
            },
        ]);
        let ids: Vec<_> = t.report("cold").marks.into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["T9", "T4"]);
    }

    #[test]
    fn nul_output_enables_measurement_without_writing() {
        let mut t = Trace::start(Instant::now());
        t.configure(Some(PathBuf::from("nul")), false);
        assert!(t.enabled());
        assert!(t.out.is_none());
    }
}
