//! アプリケーション全体で共有する状態。
//!
//! 02.architecture.md 原則 C に従い、ここに置くのは
//! 「Rust 側が速くやる仕事のために必要なもの」だけ。
//! タブ・カーソル・設定などの UI 状態は TypeScript 側にある。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use crate::bootstrap::Bootstrap;
use crate::cli::CliArgs;
use crate::trace::Trace;

pub struct AppState {
    pub args: CliArgs,
    pub trace: Trace,
    /// `take_bootstrap` で 1 回だけ取り出せる初期ペイロード（S2 の invoke 経路用）。
    bootstrap: Mutex<Option<Bootstrap>>,
    /// アセット参照を許可するディレクトリ（N-SEC-05）。
    /// 開いたドキュメントの親ディレクトリを追加していく。
    asset_roots: Mutex<Vec<PathBuf>>,
    /// ウォーム起動（S6）の計測。argv 転送を受けた時刻を要求 ID ごとに保持する。
    warm: Mutex<HashMap<u64, Instant>>,
    warm_counter: AtomicU64,
}

impl AppState {
    pub fn new(args: CliArgs, trace: Trace, bootstrap: Bootstrap) -> Self {
        let mut roots = Vec::new();
        if let Some(doc) = bootstrap.document.as_ref() {
            if let Some(parent) = PathBuf::from(&doc.meta.path).parent() {
                roots.push(parent.to_path_buf());
            }
        }
        Self {
            args,
            trace,
            bootstrap: Mutex::new(Some(bootstrap)),
            asset_roots: Mutex::new(roots),
            warm: Mutex::new(HashMap::new()),
            warm_counter: AtomicU64::new(1),
        }
    }

    /// argv 転送を受けた瞬間に呼ぶ。返した ID をフロントへ渡す。
    ///
    /// これが 02.architecture.md §5.2 のウォーム起動の起点（W0）。
    pub fn begin_warm(&self) -> u64 {
        let id = self.warm_counter.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut w) = self.warm.lock() {
            w.insert(id, Instant::now());
        }
        id
    }

    /// フロントが「本文が読める」状態に到達したら呼ぶ。経過ミリ秒を返す。
    pub fn end_warm(&self, id: u64) -> Option<f64> {
        let started = self.warm.lock().ok()?.remove(&id)?;
        Some(started.elapsed().as_secs_f64() * 1000.0)
    }

    /// 初期ペイロードを取り出す。2 回目以降は `None`。
    ///
    /// 1 回限りにしているのは、これが「起動時の一度きりの受け渡し」であることを
    /// 型ではなく振る舞いで表現するため。誤って再取得して古い状態に戻る事故を防ぐ。
    pub fn take_bootstrap(&self) -> Option<Bootstrap> {
        self.bootstrap.lock().ok().and_then(|mut b| b.take())
    }

    pub fn allow_asset_root(&self, dir: PathBuf) {
        if let Ok(mut roots) = self.asset_roots.lock() {
            if !roots.contains(&dir) {
                roots.push(dir);
            }
        }
    }

    pub fn asset_roots(&self) -> Vec<PathBuf> {
        self.asset_roots
            .lock()
            .map(|r| r.clone())
            .unwrap_or_default()
    }
}
