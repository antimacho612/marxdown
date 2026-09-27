//! 標準入力からの読み込み（F-OPEN-10）。
//!
//! `-` を受けたプロセスは stdin を一時ファイルへ書き出し、`--stdin-file` を付けて自分自身を起動し直してすぐ終了する。
//! シムは stdin を渡すために exe をフォアグラウンドで実行するため、そのプロセスが常駐するとシェルが返らない（旧 OQ-32）。
//! 起動し直した先は、単一インスタンスへの転送も含めて通常の起動と同じ経路を通る。
//!
//! 一時ファイルは読んだ直後に消す。
//! そのため `--stdin-file` には一時ディレクトリ直下のファイルしか渡せないようにしてある（ADR-0006）。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::document::{self, MAX_READ_BYTES};
use crate::error::{CoreError, CoreResult};

/// 読む前にプロセスが落ちて残った一時ファイルを消すまでの猶予。
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

/// 一時ファイルの置き場所。
fn spool_dir() -> PathBuf {
    std::env::temp_dir().join("marxdown-stdin")
}

/// `-` を受けたプロセスの処理。stdin を書き出して起動し直し、終了コードを返す。
///
/// `argv` は実行ファイル名を含まない実引数である。
/// stdin が端末のときは読まない。
/// GUI サブシステムの exe が端末からの入力を待つと、利用者からは固まったように見えるためである。
pub fn run(argv: &[String]) -> i32 {
    use std::io::IsTerminal;

    let stdin = std::io::stdin();
    if stdin.is_terminal() {
        eprintln!("marxdown: - を指定したときは、パイプで内容を渡してください（例: cat a.md | marxdown -）");
        return 2;
    }

    let file = match spool(stdin.lock()) {
        Ok(file) => file,
        Err(e) => {
            eprintln!("marxdown: 標準入力を読み込めませんでした: {e}");
            return 1;
        }
    };

    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            eprintln!("marxdown: Marxdown を起動できませんでした: {e}");
            let _ = std::fs::remove_file(&file);
            return 1;
        }
    };

    // 標準入出力は引き継がない。
    // 引き継ぐと、起動し直したプロセスがシムのパイプを握り続け、シェルが返らないことがある。
    let spawned = std::process::Command::new(exe)
        .args(relaunch_args(argv, &file))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    match spawned {
        Ok(_) => 0,
        Err(e) => {
            eprintln!("marxdown: Marxdown を起動できませんでした: {e}");
            let _ = std::fs::remove_file(&file);
            1
        }
    }
}

/// 起動し直すときの引数。`-` を取り除き、`--stdin-file` を先頭に置く。
///
/// 末尾に足さないのは、`--` より後ろに置くとパスとして解釈されるためである。
/// `--` より後ろの `-` はファイル名なので残す（`cli::parse` と同じ規則）。
fn relaunch_args(argv: &[String], file: &Path) -> Vec<String> {
    let mut out = vec!["--stdin-file".to_owned(), file.display().to_string()];
    let mut only_paths = false;
    for arg in argv {
        if !only_paths && arg == "-" {
            continue;
        }
        if arg == "--" {
            only_paths = true;
        }
        out.push(arg.clone());
    }
    out
}

/// 読み切った内容を一時ファイルへ書き出し、そのパスを返す。
///
/// 上限は開くときと同じ [`MAX_READ_BYTES`] である。
/// 超えた分まで読むとメモリを使い切るおそれがあるため、上限 + 1 バイトで読むのをやめる。
fn spool(reader: impl Read) -> CoreResult<PathBuf> {
    let mut bytes = Vec::new();
    reader.take(MAX_READ_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_READ_BYTES {
        return Err(CoreError::TooLarge {
            path: "-".to_owned(),
            size: bytes.len() as u64,
        });
    }

    let dir = spool_dir();
    std::fs::create_dir_all(&dir)?;
    sweep(&dir, SystemTime::now());

    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let file = dir.join(format!("{}-{nanos}.md", std::process::id()));
    std::fs::write(&file, bytes)?;
    Ok(file)
}

/// 古い一時ファイルを消す。失敗しても続ける。
///
/// 呼ぶのは標準入力を受け取ったときだけである。
/// 常駐中に定期的に掃除することはしない（タイマーを持たない）。
fn sweep(dir: &Path, now: SystemTime) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > STALE_AFTER);
        if stale {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// `--stdin-file` の一時ファイルを読み、消してから、タブの受け渡し箱に入れる JSON を返す。
///
/// 返す JSON はフロントの `TabTransfer`（`src/features/workspace/new-window.ts`）と同じ形で、パスを持たない無題の文書になる。
/// 未保存の印は付けない。受け取った内容から変更していないためである。
///
/// 一時ディレクトリ直下以外のファイルは読まずに `OutOfScope` を返す。
pub fn take(file: &Path) -> CoreResult<String> {
    take_in(file, &spool_dir())
}

fn take_in(file: &Path, dir: &Path) -> CoreResult<String> {
    let canonical = dunce::canonicalize(file)?;
    let spool = dunce::canonicalize(dir)?;
    if canonical.parent() != Some(spool.as_path()) {
        return Err(CoreError::OutOfScope(file.display().to_string()));
    }

    let read = document::read(&canonical, None);
    let _ = std::fs::remove_file(&canonical);
    let payload = read?;

    let mut meta = serde_json::to_value(&payload.meta).map_err(|e| CoreError::Io(e.to_string()))?;
    meta["path"] = serde_json::Value::Null;
    meta["mtimeMs"] = 0.into();
    meta["readonly"] = false.into();

    Ok(serde_json::json!({
        "meta": meta,
        "text": payload.content,
        "dirty": false,
        "eolOverride": null,
        "scrollTop": 0,
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "marxdown-stdin-test-{}-{}",
            tag,
            std::process::id()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn strings(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn relaunch_replaces_the_dash_and_puts_the_file_first() {
        let file = Path::new("t.md");
        assert_eq!(
            relaunch_args(&strings(&["-m", "edit", "-"]), file),
            strings(&["--stdin-file", "t.md", "-m", "edit"])
        );
    }

    #[test]
    fn relaunch_keeps_a_dash_after_double_dash() {
        let file = Path::new("t.md");
        assert_eq!(
            relaunch_args(&strings(&["-", "--", "-"]), file),
            strings(&["--stdin-file", "t.md", "--", "-"])
        );
    }

    #[test]
    fn take_reads_as_an_untitled_document_and_removes_the_file() {
        let dir = temp_dir("take");
        let file = dir.join("a.md");
        std::fs::write(&file, "# hi\r\n").unwrap();

        let json: serde_json::Value = serde_json::from_str(&take_in(&file, &dir).unwrap()).unwrap();
        assert_eq!(json["meta"]["path"], serde_json::Value::Null);
        assert_eq!(json["meta"]["eol"], "crlf");
        assert_eq!(json["text"], "# hi\n");
        assert_eq!(json["dirty"], false);
        assert!(!file.exists(), "読んだ後に消す");
        std::fs::remove_dir_all(&dir).ok();
    }

    /// 読んだ後に消すため、置き場所の外を受け付けると任意のファイルを消せる経路になる。
    #[test]
    fn take_refuses_files_outside_the_spool() {
        let dir = temp_dir("scope");
        let spool = dir.join("spool");
        std::fs::create_dir_all(&spool).unwrap();
        let outside = dir.join("secret.md");
        std::fs::write(&outside, "x").unwrap();

        assert!(matches!(
            take_in(&outside, &spool),
            Err(CoreError::OutOfScope(_))
        ));
        assert!(outside.exists(), "置き場所の外のファイルは消さない");

        // `..` で戻る形も、正規化した後に比べるので通らない。
        let sneaky = spool.join("..").join("secret.md");
        assert!(matches!(
            take_in(&sneaky, &spool),
            Err(CoreError::OutOfScope(_))
        ));
        assert!(outside.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn take_refuses_files_in_subdirectories() {
        let dir = temp_dir("nested");
        let nested = dir.join("sub");
        std::fs::create_dir_all(&nested).unwrap();
        let file = nested.join("a.md");
        std::fs::write(&file, "x").unwrap();

        assert!(matches!(
            take_in(&file, &dir),
            Err(CoreError::OutOfScope(_))
        ));
        assert!(file.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn spool_rejects_input_over_the_limit() {
        let reader = std::io::repeat(b'x').take(MAX_READ_BYTES + 10);
        assert!(matches!(spool(reader), Err(CoreError::TooLarge { .. })));
    }

    #[test]
    fn sweep_removes_only_stale_files() {
        let dir = temp_dir("sweep");
        let file = dir.join("old.md");
        std::fs::write(&file, "x").unwrap();

        sweep(&dir, SystemTime::now());
        assert!(file.exists(), "新しいものは残す");

        sweep(
            &dir,
            SystemTime::now() + STALE_AFTER + Duration::from_secs(60),
        );
        assert!(!file.exists(), "猶予を過ぎたものは消す");
        std::fs::remove_dir_all(&dir).ok();
    }
}
