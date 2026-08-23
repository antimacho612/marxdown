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
use crate::store::{RecentEntry, StoreData};
use crate::trace::Trace;

pub struct AppState {
    pub args: CliArgs,
    pub trace: Trace,
    /// 永続化ストア（最近開いたファイル / 表示倍率 / ウィンドウ状態）。
    /// 起動時に 1 回読み、変更のたびに書き戻す。
    store: Mutex<StoreData>,
    /// ストアの置き場所。`None` は保存先が決まらなかった場合（保存は諦める）。
    store_path: Option<PathBuf>,
    /// アセット参照を許可するディレクトリ（N-SEC-05）。
    /// 開いたドキュメントの親ディレクトリを追加していく。
    asset_roots: Mutex<Vec<PathBuf>>,
    /// ウォーム起動（S6）の計測。argv 転送を受けた時刻を要求 ID ごとに保持する。
    warm: Mutex<HashMap<u64, Instant>>,
    warm_counter: AtomicU64,
}

impl AppState {
    pub fn new(
        args: CliArgs,
        trace: Trace,
        bootstrap: &Bootstrap,
        store: StoreData,
        store_path: Option<PathBuf>,
    ) -> Self {
        let mut roots = Vec::new();
        if let Some(doc) = bootstrap.document.as_ref() {
            if let Some(parent) = PathBuf::from(&doc.meta.path).parent() {
                roots.push(parent.to_path_buf());
            }
        }
        Self {
            args,
            trace,
            store: Mutex::new(store),
            store_path,
            asset_roots: Mutex::new(roots),
            warm: Mutex::new(HashMap::new()),
            warm_counter: AtomicU64::new(1),
        }
    }

    /// ストアを書き換えて永続化する。
    ///
    /// ロックを握ったままファイル I/O をしないよう、書き出す値を複製してから解放する。
    /// ストアの更新は「最近開いたファイルに 1 件積む」程度の頻度なので、
    /// 複製のコストより保持時間のほうが問題になる。
    pub fn update_store<T>(&self, f: impl FnOnce(&mut StoreData) -> T) -> T {
        let (result, snapshot) = {
            let Ok(mut store) = self.store.lock() else {
                // 毒されたロックで起動を止めない。永続化を諦めるだけにする。
                return f(&mut StoreData::default());
            };
            let result = f(&mut store);
            (result, store.clone())
        };
        crate::store::save(self.store_path.as_deref(), &snapshot);
        result
    }

    pub fn recent(&self) -> Vec<RecentEntry> {
        self.store
            .lock()
            .map(|s| s.recent.clone())
            .unwrap_or_default()
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
