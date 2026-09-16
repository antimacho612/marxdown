//! ファイル監視（02.architecture/04-rust-responsibilities.md §4 / §5 / F-EDIT-16）。
//!
//! 監視対象は開いているファイルと、`settings.json` と、配色のディレクトリ（`themes/`）だけである。
//! ディレクトリ全体は監視しない（N-PERF-05）。
//! 中心ユースケースは「LLM が書き換えたファイルを開いたまま閲覧する」ことであり、周辺のファイルが変わったかどうかは不要な情報でしかない。
//! ファイルツリー（M3）が入ったら、開いているディレクトリの追加監視がここに載る。
//! その時点でも「開いていないものは見ない」という方針は変えない。
//!
//! 監視しているファイルはアプリ自身も書き込む（設定 UI からの保存、M2 以降の本文保存）。
//! そのため、書き込み直後のイベントをそのまま処理すると、保存するたびに再読み込みが発生してしまう。
//! この自己イベントの除外は「最後に自分が把握しているファイルの状態」との照合として一般化してある（02.architecture/04-rust-responsibilities.md §4 の「直前に自分が書いた mtime との照合」）。
//! 保存直後は `note_self_write` がこの状態を更新するため自己イベントは除外され、実体が変わっていないイベント（属性の変更、一時ファイル作成に伴う付随イベント）も同じ経路で除外される。
//!
//! ここにタイマーもポーリングも置かない（05.performance-budget/04-targets.md §5）。
//! OS の変更通知で起きるスレッドが 1 本あるだけで、待機中の CPU 使用率は 0 になる。
//! ただしデバウンス処理自体は `notify-debouncer-full` の内部スレッドが `TICK` ごとに溜まったイベントをまとめて処理する構造になっている。
//! この定期的な起動はクレートの構造によるものであり、こちらが追加したものではない（`TICK` の項を参照）。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::document;

/// 外部変更の通知（02.architecture/04-rust-responsibilities.md §1）。
pub const EVENT_FILE_CHANGED: &str = "marxdown://file-changed";
/// `settings.json` の外部変更（02.architecture/04-rust-responsibilities.md §5）。フロントは受け取ったら `read_settings` で読み直す。
pub const EVENT_SETTINGS_CHANGED: &str = "marxdown://settings-changed";
/// `themes/` の中身の変更（ADR-0014）。フロントは `list_user_themes` で読み直して当て直す。
pub const EVENT_THEMES_CHANGED: &str = "marxdown://themes-changed";

/// 変更が落ち着いたと見なすまでの時間（02.architecture/04-rust-responsibilities.md §4）。
///
/// エディターの保存は 1 回の操作でも複数のイベントになる（一時ファイルの作成、rename、属性の変更）。
/// ここを短くすると、書き換えの途中の状態を読みに行くことになる。
const DEBOUNCE: Duration = Duration::from_millis(300);

/// デバウンスの掃き出し間隔。
///
/// `notify-debouncer-full` の内部スレッドはこの間隔で起動し、溜まったイベントのうち変更が落ち着いたものを流す。
/// `None` を渡すとクレートの既定（`DEBOUNCE` の 1/4 = 75ms）になるため、明示的に半分にして起動回数を減らしている。
/// 引き換えに通知が最大 `DEBOUNCE + TICK` まで遅れるが、変更が反映されたと感じられる範囲に収まる。
const TICK: Duration = Duration::from_millis(150);

/// 監視対象の役割。パスではなく役割でイベントの宛先が決まる。
///
/// 監視・デバウンス・自己イベントの排除は役割によらず共通で、変わるのはイベント名と対象がディレクトリかどうかだけである。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// 開いているドキュメント（F-EDIT-16 / N-REL-02）。
    Document,
    /// `settings.json`（02.architecture/04-rust-responsibilities.md §5）。
    Settings,
    /// ユーザーが追加した配色（`themes/`。ADR-0014）。
    ///
    /// **ここだけ対象がディレクトリである。**
    /// 1 枚ごとに登録すると、後から置かれたファイルを拾えない。
    Themes,
}

impl Role {
    fn event(self) -> &'static str {
        match self {
            Self::Document => EVENT_FILE_CHANGED,
            Self::Settings => EVENT_SETTINGS_CHANGED,
            Self::Themes => EVENT_THEMES_CHANGED,
        }
    }
}

/// 何が起きたか。削除されたことも伝える。
///
/// 削除されたファイルを読みに行かせないよう、区別できる形で渡す必要がある。
/// 読みに行かせると「開けません」の通知が出て、直後に作り直されるともう一度表示されることになる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Modified,
    Removed,
}

/// フロントへ渡す変更（02.architecture/04-rust-responsibilities.md §1 の `path, mtime, kind`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// 消えている場合は 0。
    pub mtime_ms: i64,
    pub kind: ChangeKind,
}

/// 「最後に自分が知っているファイルの姿」。
///
/// mtime だけで判定しないのは、書き換えが同じミリ秒に収まったときに検出できないためである。
/// サイズも併せて見ることで、その多くを検出できる。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Stamp {
    mtime_ms: i64,
    size: u64,
}

fn stamp_of(path: &Path) -> Option<Stamp> {
    let meta = std::fs::metadata(path).ok()?;
    Some(Stamp {
        mtime_ms: document::mtime_ms(&meta),
        size: meta.len(),
    })
}

struct Target {
    role: Role,
    /// notify に渡した監視元。対象そのものか、まだ存在しない場合はその親ディレクトリ。
    root: PathBuf,
    /// `None` はファイルが存在しないことを表す。ディレクトリの監視では使わない。
    seen: Option<Stamp>,
    /// 対象がディレクトリか（`Role::Themes`）。中身のパスが届く。
    directory: bool,
}

/// 監視対象の台帳。Tauri に依存しない。
///
/// どのイベントを流すかの判断（`decide`）をここだけで完結させることで、自己イベントの排除をユニットテストで検証できるようにしてある。
#[derive(Default)]
struct Registry {
    /// キーは正規化済み絶対パス。
    targets: HashMap<PathBuf, Target>,
    /// notify に渡した監視元 → ぶら下がっている対象。
    ///
    /// まだ存在しないファイルは親ディレクトリを監視するため、1 つの監視元に複数の対象が対応しうる（同じフォルダーの 2 枚を開いた場合がこれにあたる）。
    /// 片方を解除したときにもう片方の監視まで解除しないよう、対応を保持しておく。
    roots: HashMap<PathBuf, HashSet<PathBuf>>,
}

impl Registry {
    /// イベントが届いたパスに対して、流すべき変更を 1 つ決める。
    ///
    /// `None` を返す場合:
    /// - 監視していないパス（親ディレクトリごと見ているときの巻き添え）
    /// - 実体が変わっていない（自分が書いた直後、または属性だけの変更）
    fn decide(&mut self, path: &Path) -> Option<(Role, FileChange)> {
        let key = self.resolve(path)?;
        let target = self.targets.get_mut(&key)?;

        // ディレクトリの監視は 1 枚ごとの姿を覚えない。
        // 中身の増減も編集も、受け取る側にとっては「全部読み直せ」でしかなく、どの枚が変わったかで処理が分かれない。
        // 覚えないぶん自分が書いた直後のイベントも通るが、通った先で読み直して同じ結果になるだけである。
        if target.directory {
            let stamp = stamp_of(path);
            return Some((
                target.role,
                FileChange {
                    path: path.display().to_string(),
                    mtime_ms: stamp.map(|s| s.mtime_ms).unwrap_or(0),
                    kind: if stamp.is_some() {
                        ChangeKind::Modified
                    } else {
                        ChangeKind::Removed
                    },
                },
            ));
        }

        let current = stamp_of(&key);
        if current == target.seen {
            return None;
        }
        target.seen = current;

        Some((
            target.role,
            FileChange {
                path: key.display().to_string(),
                mtime_ms: current.map(|s| s.mtime_ms).unwrap_or(0),
                kind: if current.is_some() {
                    ChangeKind::Modified
                } else {
                    ChangeKind::Removed
                },
            },
        ))
    }

    /// イベントのパスを、登録済みのキーに合わせる。
    ///
    /// notify が返すパスは監視元から組み立てられるため、多くはそのまま一致する。
    /// 一致しないときだけ正規化して引き直す。
    /// `document::canonicalize` は存在しないパスでも親まで解決するため、削除されたファイルでも引ける。
    fn resolve(&self, path: &Path) -> Option<PathBuf> {
        if self.targets.contains_key(path) {
            return Some(path.to_path_buf());
        }
        if let Ok(canonical) = document::canonicalize(path) {
            if self.targets.contains_key(&canonical) {
                return Some(canonical);
            }
        }
        // ディレクトリを対象にしている場合、届くのは中身のパスである。
        self.directory_of(path)
    }

    /// 親がディレクトリの対象として登録されていれば、そのキーを返す。
    fn directory_of(&self, path: &Path) -> Option<PathBuf> {
        let parent = path.parent()?;
        let is_dir_target = |key: &PathBuf| self.targets.get(key).is_some_and(|t| t.directory);

        let direct = parent.to_path_buf();
        if is_dir_target(&direct) {
            return Some(direct);
        }
        let canonical = document::canonicalize(parent).ok()?;
        is_dir_target(&canonical).then_some(canonical)
    }
}

/// ファイル監視の入口。`AppState` とは別に `manage` する。
///
/// 監視を作れなかった場合（OS 側の上限、権限）も起動は止めない。
/// 自動での再読み込みが行われなくなるだけで、`F5` は変わらず使える。
pub struct FileWatcher {
    debouncer: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    registry: Arc<Mutex<Registry>>,
}

impl FileWatcher {
    /// 監視スレッドを立てる。この時点ではまだ監視対象を登録していない。
    pub fn start(app: AppHandle) -> Self {
        let registry: Arc<Mutex<Registry>> = Arc::default();
        let for_handler = Arc::clone(&registry);

        let debouncer = new_debouncer(DEBOUNCE, Some(TICK), move |result: DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(errors) => {
                    // 監視が停止しても本文は表示されたままであるため、通知はしない。
                    for e in errors {
                        eprintln!("[marxdown] ファイル監視のエラー: {e}");
                    }
                    return;
                }
            };

            // 1 回の保存が複数のイベントになるため、パス単位にまとめてから判断する。
            // まとめないと、同じファイルに対して `metadata` を何度も呼ぶことになる。
            let mut paths = events
                .iter()
                .flat_map(|e| e.paths.clone())
                .collect::<Vec<_>>();
            paths.sort_unstable();
            paths.dedup();

            for path in paths {
                let decided = for_handler.lock().ok().and_then(|mut r| r.decide(&path));
                if let Some((role, change)) = decided {
                    let _ = app.emit(role.event(), &change);
                }
            }
        })
        .ok();

        if debouncer.is_none() {
            eprintln!("[marxdown] ファイル監視を開始できなかった（自動再読み込みは行われない）");
        }

        Self {
            debouncer: Mutex::new(debouncer),
            registry,
        }
    }

    /// 監視を始める。既に同じ役割で見ているパスなら何もしない。
    ///
    /// ファイルがまだ存在しない場合は親ディレクトリを監視し、届いたイベントをパスで絞り込む。
    /// `settings.json` は最初の保存まで存在しないため、この扱いが無いと手で作成された時点を検出できない（02.architecture/04-rust-responsibilities.md §5）。
    pub fn watch(&self, path: &Path, role: Role) -> bool {
        let Ok(key) = document::canonicalize(path) else {
            return false;
        };

        // ディレクトリはそれ自身を監視元にする（中身のイベントが届く）。
        // ファイルは、まだ存在しないうちは親を見る（後から作られたときに拾うため）。
        let directory = key.is_dir();
        let root = if directory || key.is_file() {
            key.clone()
        } else {
            let Some(parent) = key.parent() else {
                return false;
            };
            parent.to_path_buf()
        };

        let Ok(mut debouncer) = self.debouncer.lock() else {
            return false;
        };
        let Some(debouncer) = debouncer.as_mut() else {
            return false;
        };
        let Ok(mut registry) = self.registry.lock() else {
            return false;
        };

        if registry
            .targets
            .get(&key)
            .is_some_and(|t| t.role == role && t.root == root)
        {
            return true;
        }

        // 同じ監視元に既にぶら下がっているなら、notify への登録は 1 回で足りる。
        let known_root = registry.roots.contains_key(&root);
        if !known_root && debouncer.watch(&root, RecursiveMode::NonRecursive).is_err() {
            return false;
        }

        let seen = stamp_of(&key);
        registry.targets.insert(
            key.clone(),
            Target {
                role,
                root: root.clone(),
                seen,
                directory,
            },
        );
        registry.roots.entry(root).or_default().insert(key);
        true
    }

    /// 監視をやめる。
    ///
    /// 解除の経路は必ず用意しておく。
    /// タブ（M3）が入ると開いた数だけ監視が積算し、常駐しているため解放されないまま残る（ADR-0004 / 02.architecture/04-rust-responsibilities.md §4）。
    pub fn unwatch(&self, path: &Path) {
        let Ok(key) = document::canonicalize(path) else {
            return;
        };
        self.unwatch_key(&key);
    }

    fn unwatch_key(&self, key: &Path) {
        let Ok(mut debouncer) = self.debouncer.lock() else {
            return;
        };
        let Ok(mut registry) = self.registry.lock() else {
            return;
        };
        let Some(target) = registry.targets.remove(key) else {
            return;
        };

        // 監視元を共有している対象が残っている間は、notify への解除はできない。
        let empty = match registry.roots.get_mut(&target.root) {
            Some(paths) => {
                paths.remove(key);
                paths.is_empty()
            }
            None => false,
        };
        if empty {
            registry.roots.remove(&target.root);
            if let Some(debouncer) = debouncer.as_mut() {
                let _ = debouncer.unwatch(&target.root);
            }
        }
    }

    /// 「いま開いているドキュメント」を差し替える（02.architecture/04-rust-responsibilities.md §4「タブを閉じたらウォッチャを解除する」）。
    ///
    /// M3 でタブが入るまで、開いているドキュメントは 1 つだけである。
    /// 前のファイルの監視をここで必ず解除することで、開き直すたびに監視が積み上がらない。
    pub fn watch_document(&self, path: &Path) -> bool {
        let keep = document::canonicalize(path).ok();

        let stale = match self.registry.lock() {
            Ok(registry) => registry
                .targets
                .iter()
                .filter(|(p, t)| t.role == Role::Document && Some(*p) != keep.as_ref())
                .map(|(p, _)| p.clone())
                .collect::<Vec<_>>(),
            Err(_) => return false,
        };
        for path in stale {
            self.unwatch_key(&path);
        }

        self.watch(path, Role::Document)
    }

    /// 自分がファイルを書いた直後に呼ぶ（02.architecture/04-rust-responsibilities.md §4 の「直前の保存 mtime と照合」）。
    ///
    /// これを忘れると、設定 UI から保存するたびに「外部で変更された」通知が発生する。
    pub fn note_self_write(&self, path: &Path) {
        let Ok(key) = document::canonicalize(path) else {
            return;
        };
        let Ok(mut registry) = self.registry.lock() else {
            return;
        };
        let stamp = stamp_of(&key);
        if let Some(target) = registry.targets.get_mut(&key) {
            target.seen = stamp;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 台帳のキーは正規化済みパスなので、テスト側も正規化した場所を使う。
    /// Windows の `%TEMP%` は 8.3 形式のことがあり、素の `join` では引けなくなる。
    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-watch-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        dunce::canonicalize(&d).unwrap_or(d)
    }

    /// notify を通さずに台帳だけを組み立てる。
    /// ここで確かめたいのは「どのイベントを流すか」の判断だけ。
    fn registry_with(path: &Path, role: Role) -> Registry {
        let key = document::canonicalize(path).unwrap();
        let mut registry = Registry::default();
        registry.targets.insert(
            key.clone(),
            Target {
                role,
                root: key.clone(),
                seen: stamp_of(&key),
                directory: key.is_dir(),
            },
        );
        registry.roots.entry(key.clone()).or_default().insert(key);
        registry
    }

    /// 中身が変わっていないイベントは流さない。
    /// 保存直後の自己イベント（02.architecture/04-rust-responsibilities.md §4）が落ちるのはこの性質による。
    #[test]
    fn an_event_without_a_real_change_is_dropped() {
        let d = temp_dir("noop");
        let p = d.join("a.md");
        std::fs::write(&p, "# a").unwrap();

        let mut registry = registry_with(&p, Role::Document);

        assert!(registry.decide(&p).is_none());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn an_external_change_is_reported_as_modified() {
        let d = temp_dir("modified");
        let p = d.join("a.md");
        std::fs::write(&p, "# a").unwrap();

        let mut registry = registry_with(&p, Role::Document);
        std::fs::write(&p, "# a\n\n外から書き換えた").unwrap();

        let (role, change) = registry.decide(&p).expect("流すべき変更");

        assert_eq!(role, Role::Document);
        assert_eq!(change.kind, ChangeKind::Modified);
        assert!(change.mtime_ms > 0);
        std::fs::remove_dir_all(&d).ok();
    }

    /// 02.architecture/04-rust-responsibilities.md §4 の自己イベント排除。保存した側が姿を教えておけば、続くイベントは落ちる。
    #[test]
    fn a_self_write_is_not_reported() {
        let d = temp_dir("self");
        let p = d.join("settings.json");
        std::fs::write(&p, "{}").unwrap();

        let mut registry = registry_with(&p, Role::Settings);
        std::fs::write(&p, r#"{"theme":"dark"}"#).unwrap();
        // `note_self_write` 相当。書いた側が「いまの姿」を台帳に入れる。
        registry.targets.get_mut(&p).unwrap().seen = stamp_of(&p);

        assert!(registry.decide(&p).is_none());
        std::fs::remove_dir_all(&d).ok();
    }

    /// 消えたことは 1 回だけ伝える。
    /// 繰り返し流すと、通知バーが同じ内容で何度も入れ替わる。
    #[test]
    fn a_removal_is_reported_once() {
        let d = temp_dir("removed");
        let p = d.join("a.md");
        std::fs::write(&p, "# a").unwrap();

        let mut registry = registry_with(&p, Role::Document);
        std::fs::remove_file(&p).unwrap();

        let (_, change) = registry.decide(&p).expect("消えたことは伝える");
        assert_eq!(change.kind, ChangeKind::Removed);
        assert_eq!(change.mtime_ms, 0);

        assert!(registry.decide(&p).is_none(), "2 回目は流さない");
        std::fs::remove_dir_all(&d).ok();
    }

    /// 親ディレクトリごと見ているときの巻き添え（`state.json` の保存など）を落とす。
    #[test]
    fn an_event_for_an_unwatched_path_is_dropped() {
        let d = temp_dir("other");
        let watched = d.join("settings.json");
        let other = d.join("state.json");
        std::fs::write(&watched, "{}").unwrap();
        std::fs::write(&other, "{}").unwrap();

        let mut registry = registry_with(&watched, Role::Settings);

        assert!(registry.decide(&other).is_none());
        std::fs::remove_dir_all(&d).ok();
    }

    /// 役割が宛先を決める。設定の変更がドキュメントの再読み込みを起こさない。
    #[test]
    fn the_role_decides_the_event() {
        assert_eq!(Role::Document.event(), EVENT_FILE_CHANGED);
        assert_eq!(Role::Settings.event(), EVENT_SETTINGS_CHANGED);
        assert_eq!(Role::Themes.event(), EVENT_THEMES_CHANGED);
    }

    /// 同じフォルダーの 2 枚を開いたときの帰結。
    ///
    /// まだ無いファイルは親ディレクトリを見るため、監視元を共有することがある。
    /// 共有しているので、**片方を外したときにもう片方まで落ちない**ことを台帳の側で担保する必要がある。
    #[test]
    fn two_targets_can_share_one_root() {
        let d = temp_dir("shared-root");
        let first = d.join("first.md");
        let second = d.join("second.md");

        let mut registry = Registry::default();
        for path in [&first, &second] {
            registry.targets.insert(
                path.clone(),
                Target {
                    role: Role::Document,
                    root: d.clone(),
                    seen: stamp_of(path),
                    directory: false,
                },
            );
            registry
                .roots
                .entry(d.clone())
                .or_default()
                .insert(path.clone());
        }

        // 後から作られたファイルも拾える（親ディレクトリを見ているため）。
        std::fs::write(&second, "# 後から作られた").unwrap();

        let (role, change) = registry.decide(&second).expect("後から作られても拾う");
        assert_eq!(role, Role::Document);
        assert_eq!(change.kind, ChangeKind::Modified);
        assert_eq!(registry.roots[&d].len(), 2, "監視元は 1 つ、対象は 2 つ");
        std::fs::remove_dir_all(&d).ok();
    }
}
