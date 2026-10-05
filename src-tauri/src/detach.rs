//! CLI から起動したときにシェルをつかまない（旧 OQ-32 / M10 §4.3）。
//!
//! Windows ではシム（`bin\marxdown.cmd`）がこの役を担う。
//! Unix にはシムを置かず、本体が自分自身を新しいセッションで起動し直し、元のプロセスはすぐに終了する。
//! `.deb` が `/usr/bin` に置く実行ファイルと、macOS のシンボリックリンクがそのまま CLI になる。

use std::process::{Child, Command, Stdio};

#[cfg(unix)]
use crate::cli::CliArgs;

/// 起動し直したプロセスに付ける引数。
/// 2 回目の切り離しを止める（`cli.rs` の `foreground`）。
#[cfg(unix)]
const FOREGROUND_FLAG: &str = "--foreground";

/// 端末から切り離して起動し直すべきか。
///
/// 切り離さないのは、出力を呼び出し元へ返す経路（`--help` / `--version` / `-`）、計測用のフラグがあるとき、ログイン時の自動起動、開発ビルドである。
/// 開発ビルドで切り離すと、`tauri dev` が監視している親が終了し、開発サーバーごと止まる。
#[cfg(unix)]
pub fn should_detach(args: &CliArgs) -> bool {
    if cfg!(debug_assertions) || args.foreground || args.background {
        return false;
    }
    if args.show_help || args.show_version || args.stdin || args.stdin_file.is_some() {
        return false;
    }
    if args.trace_startup.is_some()
        || args.bench_input.is_some()
        || args.exit_after_trace
        || args.gc_probe
    {
        return false;
    }
    !launched_by_launch_services()
}

/// Finder や `open` から起動されたか。
///
/// このとき開くファイルは argv ではなく、起動したプロセスへの `RunEvent::Opened` で届く（`macos.rs`）。
/// 起動し直すと、そのイベントを受け取るプロセスがいなくなる。
/// LaunchServices が起動したプロセスの親は launchd（PID 1）である。
#[cfg(target_os = "macos")]
fn launched_by_launch_services() -> bool {
    // SAFETY: 引数を取らず、失敗しない。
    unsafe { libc::getppid() == 1 }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn launched_by_launch_services() -> bool {
    false
}

/// 自分自身を `argv` で起動し直す。
/// 標準入出力は引き継がない。
///
/// 引き継ぐと、起動し直したプロセスが呼び出し元のパイプを握り続け、シェルが返らないことがある。
/// Unix では新しいセッションで起動し、端末を閉じたときの `SIGHUP` で一緒に終わらないようにする。
pub fn spawn_self(argv: &[String]) -> std::io::Result<Child> {
    let mut command = Command::new(self_path()?);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        command.arg(FOREGROUND_FLAG);
        // SAFETY: `setsid` は async-signal-safe であり、fork の後で呼んでよい。
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    command
        .args(argv)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

/// 起動し直すときの実行ファイル。
///
/// AppImage では `current_exe` がマウントした中身を指し、元のプロセスが終わるとマウントごと消える。
/// AppImage 自身のパス（`APPIMAGE`）から起動し直す。
fn self_path() -> std::io::Result<std::path::PathBuf> {
    #[cfg(all(unix, not(target_os = "macos")))]
    if let Some(image) = std::env::var_os("APPIMAGE").filter(|v| !v.is_empty()) {
        return Ok(image.into());
    }
    std::env::current_exe()
}

/// 端末から切り離して起動し直し、元のプロセスの終了コードを返す。
#[cfg(unix)]
pub fn run() -> i32 {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match spawn_self(&argv) {
        Ok(_) => 0,
        Err(e) => {
            eprintln!("marxdown: {}: {e}", crate::i18n::text().launch_failed);
            1
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn parsed(list: &[&str]) -> CliArgs {
        let argv: Vec<String> = list.iter().map(|s| (*s).to_owned()).collect();
        crate::cli::parse(&argv, std::path::Path::new("/work"))
    }

    /// 出力を呼び出し元へ返す経路と計測の経路は、切り離すと結果が呼び出し元へ届かない。
    #[test]
    fn keeps_the_process_when_output_or_measurement_is_expected() {
        for list in [
            &["--help"][..],
            &["--version"],
            &["-"],
            &["--stdin-file", "x.md"],
            &["--trace-startup", "out.json", "a.md"],
            &["--bench-input", "out.json", "a.md"],
            &["--exit-after-trace", "a.md"],
            &["--gc-probe", "a.md"],
            &["--background"],
            &["--foreground", "a.md"],
        ] {
            assert!(!should_detach(&parsed(list)), "{list:?}");
        }
    }
}
