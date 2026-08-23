//! Marxdown Core (Rust)
//!
//! 責務は 02.architecture.md 原則 C の 3 つに限定する。
//!
//! - ファイル I/O（速く、安全に、原子的に）
//! - OS 統合（CLI 引数、関連付け、単一インスタンス、ウィンドウ）
//! - フロントエンドより先に始められる仕事の先回り
//!
//! UI ロジックと Markdown の意味解釈は TypeScript 側にある。

pub mod bootstrap;
pub mod cli;
pub mod commands;
pub mod document;
pub mod error;
pub mod scope;
pub mod state;
pub mod store;
pub mod trace;
pub mod window;

use std::time::Instant;

use tauri::{Emitter, Manager};

/// 別インスタンスから転送された起動要求（ADR-0004）。
///
/// 02.architecture.md §5.2 のウォーム起動。ここには WebView の初期化も、
/// バンドルの評価も、React のマウントも存在しない。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    /// この要求の計測 ID。フロントは描画完了後に `warm_done` へ返す（S6）。
    pub request_id: u64,
    pub paths: Vec<String>,
    pub new_window: bool,
    pub mode: Option<cli::ViewMode>,
    /// 転送側が計測を要求していたか。ウォーム起動の計測に使う。
    pub trace: bool,
}

pub const EVENT_OPEN_REQUEST: &str = "marxdown://open-request";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // T0。これより前に何も置かない。
    let t0 = Instant::now();

    let args = cli::parse_process_args();

    if args.show_help {
        println!("{}", cli::HELP);
        return;
    }
    if args.show_version {
        println!("marxdown {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    let mut trace = trace::Trace::start(t0);
    trace.configure(args.trace_startup.clone(), args.exit_after_trace);
    trace.mark("T1", Some(format!("{} path(s)", args.paths.len())));

    // Context を先に作るのは、`identifier` からストアの置き場所を決めるため。
    // `tauri::Manager::path()` は AppHandle 構築後にしか使えないが、
    // ウィンドウ状態はウィンドウ生成の**前に**要る（window.rs）。
    let context = tauri::generate_context!();
    let store_path = store::store_path(&context.config().identifier);
    let store_data = store::load(store_path.as_deref());
    let restore_window = store_data.window;

    // T2: ファイル読み込み。ウィンドウ生成の前に行い、WebView 初期化と重ねる。
    let payload = bootstrap::build(&args, &trace, &store_data);
    trace.mark(
        "T2",
        payload
            .document
            .as_ref()
            .map(|d| format!("{} bytes, inlined={}", d.meta.size, d.content.is_some())),
    );

    let channel = args.spike.bootstrap;
    let state = state::AppState::new(args, trace, payload.clone(), store_data, store_path);

    let mut builder = tauri::Builder::default();

    // 単一インスタンス化は**他のどのプラグインよりも先**に登録する必要がある。
    // 2 番目のプロセスは、ここでコールバックを実行したあと即座に終了する。
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // W0。argv 転送を受けた瞬間。ここから「本文が読める」までがウォーム起動。
            let request_id = app.state::<state::AppState>().begin_warm();

            let forwarded = cli::parse(
                &argv.into_iter().skip(1).collect::<Vec<_>>(),
                std::path::Path::new(&cwd),
            );
            let request = OpenRequest {
                request_id,
                paths: forwarded
                    .paths
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect(),
                new_window: forwarded.new_window,
                mode: forwarded.mode,
                trace: forwarded.trace_startup.is_some(),
            };
            if let Some(w) = app.get_webview_window(window::MAIN_LABEL) {
                // 先に前面化する。ユーザーが見ている画面が切り替わるほうが、
                // タブの追加より体感に効く。
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.emit(EVENT_OPEN_REQUEST, &request);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::take_bootstrap,
            commands::read_document,
            commands::write_document,
            commands::resolve_asset,
            commands::store_push_recent,
            commands::store_remove_recent,
            commands::store_set_zoom,
            commands::report_trace,
            commands::ready,
            commands::open_external,
            commands::reveal_in_file_manager,
            commands::startup_trace,
            commands::warm_done,
        ])
        .setup(move |app| {
            window::create(
                app.handle(),
                window::MAIN_LABEL,
                &payload,
                channel,
                restore_window,
            )?;
            let state = app.state::<state::AppState>();
            state.trace.mark("T3", None);
            Ok(())
        })
        // ウィンドウ位置・サイズの保存（F-CONF-10）。
        //
        // 閉じる瞬間にだけ書く。移動・リサイズのたびに書くと、ウィンドウを
        // ドラッグしている間ずっとファイル I/O が走る。
        .on_window_event(|window, event| {
            if !matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                return;
            }
            if window.label() != window::MAIN_LABEL {
                return;
            }
            let Some(webview) = window.get_webview_window(window::MAIN_LABEL) else {
                return;
            };
            let Some(captured) = window::capture(&webview) else {
                return;
            };
            window
                .state::<state::AppState>()
                .update_store(|s| s.window = Some(captured));
        })
        .run(context)
        .expect("error while running tauri application");
}
