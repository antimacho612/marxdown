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
pub mod settings;
pub mod state;
pub mod store;
pub mod trace;
pub mod watch;
pub mod window;

use std::time::Instant;

use tauri::{Emitter, Manager};

/// 別インスタンスから転送された起動要求（ADR-0004）。
///
/// 02.architecture.md §5.2 のウォーム起動。ここには WebView の初期化も、
/// バンドルの評価も、Svelte のマウントも存在しない。
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

/// 最大化状態が変わったことをフロントへ知らせる（ペイロードは `bool`）。
///
/// カスタムタイトルバー（OQ-02 = B）にしたので、`□` と `❐` の描き分けは
/// フロントの仕事になった。**変化したときだけ**流す。`Resized` はドラッグ中に
/// 毎フレーム飛んでくるので、素通しすると意味のない IPC が積み上がる。
pub const EVENT_WINDOW_MAXIMIZED: &str = "marxdown://window-maximized";

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

    // 設定も同じ理由でここで読む。見た目に効く値（テーマ / 本文幅 / フォント）は
    // **本文を描くより前**に当たっている必要があり、後から当てると FOUC になる
    // （02.architecture.md §5.1 の判断基準）。1KB 未満のファイル 1 枚。
    let settings_path = settings::settings_path(&context.config().identifier);
    let settings_data = settings::load(settings_path.as_deref());

    // T2: ファイル読み込み。ウィンドウ生成の前に行い、WebView 初期化と重ねる。
    let payload = bootstrap::build(&args, &trace, &store_data, &settings_data);
    trace.mark(
        "T2",
        payload
            .document
            .as_ref()
            .map(|d| format!("{} bytes, inlined={}", d.meta.size, d.content.is_some())),
    );

    let state = state::AppState::new(
        args,
        trace,
        &payload,
        store_data,
        store_path,
        settings_data,
        settings_path,
    );

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
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::read_document,
            commands::write_document,
            commands::resolve_asset,
            commands::pick_file,
            commands::store_push_recent,
            commands::store_remove_recent,
            commands::store_set_zoom,
            commands::read_settings,
            commands::write_settings,
            commands::open_settings_file,
            commands::watch_path,
            commands::unwatch_path,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::report_trace,
            commands::ready,
            commands::open_external,
            commands::open_local_file,
            commands::reveal_in_file_manager,
            commands::startup_trace,
            commands::warm_done,
        ])
        .setup(move |app| {
            // T2b: Tauri のブートとプラグイン初期化が終わった時点。
            // T2→T3 が伸びたときに「WebView2 が重いのか、自分たちが足したものが重いのか」を
            // 切り分けられるようにする（05.performance-budget.md §5.2）。
            let state = app.state::<state::AppState>();
            state.trace.mark("T2b", None);

            // bootstrap で開いた初期ドキュメントは IPC（read_document）を経由しないため、
            // ここで改めて Tauri 本体の asset プロトコルスコープに登録しないと
            // 最初に開いたファイルの相対パス画像が 403 になる。
            for root in state.asset_roots() {
                let _ = app.asset_protocol_scope().allow_directory(root, true);
            }

            // ファイル監視（§4.4）。**ウィンドウを作る前に `manage` する。**
            // WebView が動き出した直後の `watch_path` が、まだ管理されていない状態を
            // 引き当てないようにするため。ここで起きるのはスレッド 1 本ぶんの生成だけで、
            // ファイル I/O は伴わない（実際に何を見るかは下で決める）。
            app.manage(watch::FileWatcher::start(app.handle().clone()));

            window::create(app.handle(), window::MAIN_LABEL, &payload, restore_window)?;
            state.trace.mark("T3", None);

            // 監視の登録は T3 の後。ここから先は「本文が読める」までの経路に載らない
            // （§5.1 の判断基準: IPC を伴わず、遅れても最悪 300ms 反映が遅れるだけ）。
            //
            // 開いているドキュメントの登録はフロントが `watch_path` で行う。
            // **`settings.json` だけは Rust 側で登録する。** パスを知っているのは
            // こちらだけであり、取りに行かせると IPC が 1 往復増える（§4.5）。
            if let Some(path) = state.settings_path() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::Settings);
            }

            Ok(())
        })
        // ウィンドウ位置・サイズの保存（F-CONF-10）。
        //
        // 閉じる瞬間にだけ書く。移動・リサイズのたびに書くと、ウィンドウを
        // ドラッグしている間ずっとファイル I/O が走る。
        .on_window_event(|window, event| {
            if window.label() != window::MAIN_LABEL {
                return;
            }

            // 最大化状態の変化をフロントへ流す（ウィンドウ操作ボタンの絵柄）。
            //
            // ボタンを押したときだけでなく、`Win+↑` / ダブルクリック / 上端への
            // ドラッグでも変わる。**押した側で状態を持たず、OS が真実**という形にすると、
            // 経路が増えても絵柄がずれない。変化の判定は `AppState` が持つ。
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let now = window.is_maximized().unwrap_or(false);
                if window.state::<state::AppState>().note_maximized(now) {
                    let _ = window.emit(EVENT_WINDOW_MAXIMIZED, now);
                }
                return;
            }

            if !matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
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
