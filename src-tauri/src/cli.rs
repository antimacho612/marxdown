//! CLI 引数解析（F-OPEN-01 / F-OPEN-12）。
//!
//! `tauri-plugin-cli` は使わない。
//! その `matches()` は `App` の構築後（`setup()` の中）でしか呼べない。
//! 一方、02.architecture/05-startup-sequence.md §1 の起動シーケンスは、ウィンドウ生成より前にパスを確定させ、ファイル読み込みを WebView 初期化と並行させることを要求する。
//! そのため、プラグイン経由ではこの並行化ができない。
//! また、05.performance-budget/05-operations.md §2 の T1（CLI 引数解析完了）を T0 の直後に置けることが、内訳の計測そのものに必要である。
//!
//! よって argv は `std::env::args_os()` から直接読む。
//! 引数体系は 03.ux-spec/README.md に閉じており、clap を要する複雑さはない（04.tech-stack/06-rust.md §3）。

use std::path::{Path, PathBuf};

/// 起動時の表示モード（F-MODE-01〜03）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    Preview,
    Edit,
    Split,
}

/// 解析済みの起動引数。
/// 不正な引数でも解析は失敗させず、`unknown` に加えて通知バーで知らせる。
#[derive(Debug, Clone, Default)]
pub struct CliArgs {
    /// 絶対パスに解決済み。存在確認はまだ行っていない。
    pub paths: Vec<PathBuf>,
    pub new_window: bool,
    pub mode: Option<ViewMode>,
    /// `--trace-startup <path>`。`nul` / `/dev/null` は「計測はするが書き出さない」。
    pub trace_startup: Option<PathBuf>,
    /// トレース計測後にプロセスを終了する（`bench-startup.mjs` 用）。
    pub exit_after_trace: bool,
    /// `--bench-input <OUT>`。入力レスポンスを計測し、JSON を書き出して終了する。
    ///
    /// 計測専用（`scripts/bench-input.mjs` 用）。
    /// 入力レスポンス（05.performance-budget/04-targets.md §3）はこの経路でしか測定できない。
    pub bench_input: Option<PathBuf>,
    /// `--gc-probe`。WebView2 に `--js-flags=--expose-gc` を渡す。
    ///
    /// 計測専用（05.performance-budget/05-operations.md §3）。
    /// 閉じた文書のメモリが、到達可能な参照によって残っているのか、GC が未実行なだけなのかを切り分けるために使う。
    /// これが無いと DevTools から `gc()` を呼べない。
    pub gc_probe: bool,
    pub show_help: bool,
    pub show_version: bool,
    /// 解析できなかった引数。警告として通知バーに出す。
    pub unknown: Vec<String>,
}

/// `--help` の出力。オプションを足したらここも直す。
pub const HELP: &str = "\
marxdown — Markdown を見る・書くなら、これ一択。

USAGE:
    marxdown [OPTIONS] [FILE|DIR]...

OPTIONS:
    -n, --new-window           既存プロセスを使いつつ、新しいウィンドウで開く
    -m, --mode <MODE>          起動時の表示モード: preview | edit | split
        --trace-startup <OUT>  起動計測を有効にし、JSON を OUT へ書き出す
                               OUT に nul を指定すると計測のみ行い書き出さない
        --exit-after-trace     計測の書き出し後にプロセスを終了する（ベンチ用）
    -h, --help                 このヘルプを表示する
    -V, --version              バージョンを表示する

MEASUREMENT OPTIONS (計測用。開発ビルドでのみ意味を持つ):
        --gc-probe                              DevTools から gc() を呼べるようにする
        --bench-input <OUT>                     入力レスポンスを計測し JSON を OUT へ書き出して終了する
";

/// `argv`（実行ファイル名を含まない）と `cwd` から引数を解析する。
///
/// `cwd` を明示的に受け取るのは、単一インスタンスの argv 転送で 2 番目のプロセスの cwd を使って相対パスを解決する必要があるためである（ADR-0004）。
pub fn parse(argv: &[String], cwd: &Path) -> CliArgs {
    let mut args = CliArgs::default();
    let mut i = 0;
    // `--` 以降はすべてパスとして扱う
    let mut only_paths = false;

    while i < argv.len() {
        let arg = argv[i].as_str();
        i += 1;

        if only_paths {
            args.paths.push(resolve(cwd, arg));
            continue;
        }

        // `--key=value` 形式を `--key value` に正規化する
        let (key, inline) = match arg.split_once('=') {
            Some((k, v)) if k.starts_with("--") => (k, Some(v.to_string())),
            _ => (arg, None),
        };

        // クロージャにすると `args` と `i` を可変借用したまま match 内でも参照することになる。
        // そのため、呼び出し位置で展開されるマクロにしている。
        macro_rules! take_value {
            ($name:literal) => {{
                if let Some(v) = inline.clone() {
                    Some(v)
                } else if i < argv.len() {
                    let v = argv[i].clone();
                    i += 1;
                    Some(v)
                } else {
                    args.unknown.push(concat!($name, " に値がない").to_string());
                    None
                }
            }};
        }

        match key {
            "--" => only_paths = true,
            "-h" | "--help" => args.show_help = true,
            "-V" | "--version" => args.show_version = true,
            "-n" | "--new-window" => args.new_window = true,
            "--exit-after-trace" => args.exit_after_trace = true,
            "--gc-probe" => args.gc_probe = true,
            "-m" | "--mode" => {
                if let Some(v) = take_value!("--mode") {
                    match v.as_str() {
                        "preview" => args.mode = Some(ViewMode::Preview),
                        "edit" => args.mode = Some(ViewMode::Edit),
                        "split" => args.mode = Some(ViewMode::Split),
                        other => args.unknown.push(format!("--mode の値が不正: {other}")),
                    }
                }
            }
            "--trace-startup" => {
                if let Some(v) = take_value!("--trace-startup") {
                    args.trace_startup = Some(resolve(cwd, &v));
                }
            }
            "--bench-input" => {
                if let Some(v) = take_value!("--bench-input") {
                    args.bench_input = Some(resolve(cwd, &v));
                }
            }
            // WebView2 / Tauri 自身が受け取るフラグは通知せずに無視する
            other if other.starts_with("--webview") || other.starts_with("--wv2") => {}
            other if other.starts_with('-') && other.len() > 1 => {
                args.unknown.push(other.to_string());
            }
            path => args.paths.push(resolve(cwd, path)),
        }
    }

    args
}

/// プロセスの実引数から解析する。`main()` の冒頭で 1 回だけ呼ぶ。
pub fn parse_process_args() -> CliArgs {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    parse(&argv, &cwd)
}

/// 相対パスを `cwd` 基準の絶対パスにする。
///
/// ここでは `canonicalize` しない。
/// 存在しないパス（新規作成）も受け付ける必要があり、canonicalize は I/O を伴うためクリティカルパス上では避ける。
/// 正規化と symlink 解決は、実際にファイルへアクセスする `document` / `resolve_asset` 側で行う。
fn resolve(cwd: &Path, raw: &str) -> PathBuf {
    let p = Path::new(raw);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        cwd.join(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cwd() -> PathBuf {
        if cfg!(windows) {
            PathBuf::from(r"C:\work")
        } else {
            PathBuf::from("/work")
        }
    }

    fn args(list: &[&str]) -> CliArgs {
        let v: Vec<String> = list.iter().map(|s| (*s).to_string()).collect();
        parse(&v, &cwd())
    }

    /// メモリ計測用。既定では渡らないことが要件の半分なので、付けたときだけ true になることを固定する。
    #[test]
    fn the_gc_probe_is_opt_in() {
        assert!(!args(&["a.md"]).gc_probe, "既定では expose-gc を渡さない");
        assert!(args(&["--gc-probe", "a.md"]).gc_probe);
    }

    #[test]
    fn resolves_relative_path_against_cwd() {
        let a = args(&["README.md"]);
        assert_eq!(a.paths, vec![cwd().join("README.md")]);
    }

    #[test]
    fn keeps_absolute_path_as_is() {
        let abs = if cfg!(windows) {
            r"C:\other\a.md"
        } else {
            "/other/a.md"
        };
        let a = args(&[abs]);
        assert_eq!(a.paths, vec![PathBuf::from(abs)]);
    }

    #[test]
    fn accepts_multiple_paths() {
        let a = args(&["a.md", "b.md", "c.md"]);
        assert_eq!(a.paths.len(), 3);
    }

    #[test]
    fn parses_mode() {
        assert_eq!(args(&["--mode", "split"]).mode, Some(ViewMode::Split));
        assert_eq!(args(&["--mode=edit"]).mode, Some(ViewMode::Edit));
        assert_eq!(args(&["-m", "preview"]).mode, Some(ViewMode::Preview));
    }

    #[test]
    fn invalid_mode_goes_to_unknown() {
        let a = args(&["--mode", "wysiwyg"]);
        assert_eq!(a.mode, None);
        assert_eq!(a.unknown.len(), 1);
    }

    #[test]
    fn parses_new_window_flag() {
        assert!(args(&["-n", "a.md"]).new_window);
        assert!(args(&["--new-window"]).new_window);
    }

    #[test]
    fn resolves_trace_output_against_cwd() {
        let a = args(&["--trace-startup", "out.json", "a.md"]);
        assert_eq!(a.trace_startup, Some(cwd().join("out.json")));
        assert_eq!(a.paths, vec![cwd().join("a.md")]);
    }

    /// `--trace-startup` と同じく、出力先は cwd 基準で解決する。
    /// 既定では有効にならないことが要件の半分（計測経路が普段の起動に混ざらない）。
    #[test]
    fn the_input_bench_is_opt_in_and_resolves_its_output() {
        assert!(args(&["a.md"]).bench_input.is_none());

        let a = args(&["--bench-input", "out.json", "a.md"]);
        assert_eq!(a.bench_input, Some(cwd().join("out.json")));
        assert_eq!(a.paths, vec![cwd().join("a.md")]);
        assert!(a.unknown.is_empty());
    }

    /// 実装の比較にだけ使うフラグ（`--spike-*`）は受け付けない。
    /// 比較のためだけの経路を製品に残さない（05.performance-budget/05-operations.md §1）。
    #[test]
    fn retired_spike_flags_are_no_longer_recognized() {
        let a = args(&[
            "--spike-bootstrap=invoke",
            "--spike-paint=bulk",
            "--spike-render=dom",
            "--spike-parse=main",
        ]);
        assert_eq!(a.unknown.len(), 4, "撤去したフラグは未知の引数として扱う");
        assert!(a.paths.is_empty());
    }

    #[test]
    fn double_dash_makes_everything_a_path() {
        let a = args(&["--", "--mode", "-n"]);
        assert_eq!(a.paths.len(), 2);
        assert_eq!(a.mode, None);
        assert!(!a.new_window);
    }

    #[test]
    fn unknown_flag_is_not_a_path() {
        let a = args(&["--nope", "a.md"]);
        assert_eq!(a.paths, vec![cwd().join("a.md")]);
        assert_eq!(a.unknown, vec!["--nope".to_string()]);
    }
}
