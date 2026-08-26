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
pub mod close;
pub mod commands;
pub mod custom_css;
pub mod document;
pub mod error;
pub mod scope;
pub mod settings;
/// Windows の Snap Layouts。**Windows 以外では空**（ファイル冒頭の `#![cfg(windows)]`）。
pub mod snap_layouts;
pub mod state;
pub mod store;
pub mod trace;
pub mod tray;
pub mod watch;
pub mod webview;
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

/// 「外から 1 枚開かせる」を 1 か所に集める。
///
/// argv 転送（ADR-0004）とトレイの「最近開いたファイル」（ADR-0007 論点 6）は、
/// **意味がまったく同じ**である。別の入口を作ると、ウォーム起動の計測・履歴・
/// 通知のどれかが片方だけ抜ける。フロント側で `open.ts` が 5 つの入口を
/// 集約しているのと同じ判断を、Rust 側でもする。
pub fn forward_open<R: tauri::Runtime>(app: &tauri::AppHandle<R>, paths: Vec<String>) {
    let Some(state) = app.try_state::<state::AppState>() else {
        return;
    };
    let request = OpenRequest {
        request_id: state.begin_warm(),
        paths,
        new_window: false,
        mode: None,
        trace: false,
    };
    let _ = app.emit_to(window::MAIN_LABEL, EVENT_OPEN_REQUEST, &request);
}

/// 最大化状態が変わったことをフロントへ知らせる（ペイロードは `bool`）。
///
/// カスタムタイトルバー（OQ-02 = B）にしたので、`□` と `❐` の描き分けは
/// フロントの仕事になった。**変化したときだけ**流す。`Resized` はドラッグ中に
/// 毎フレーム飛んでくるので、素通しすると意味のない IPC が積み上がる。
pub const EVENT_WINDOW_MAXIMIZED: &str = "marxdown://window-maximized";

/// トレイメニューの「Marxdown を開く」。フロントの `openViaDialog` に載せる。
///
/// **Rust 側でダイアログを出さない。** `pick_file` は既にあるが、
/// 「開いた結果をどう扱うか」（履歴・通知・相対パス解決）はフロントの
/// `open.ts` に集めてある。トレイから別経路で開くと、そこだけ抜ける。
pub const EVENT_TRAY_OPEN: &str = "marxdown://tray-open";

/// トレイから復帰した瞬間（ADR-0007「計測項目」の Tray Resume）。
///
/// **Warm Start（20.0ms）とは別の経路である。** あちらは「ウィンドウが可視のまま
/// argv 転送を受けた」値で、こちらは「サスペンドされた WebView が起こされて
/// 画面に出る」までを測る。同じ数字だと思って比べると判断を誤る。
pub const EVENT_TRAY_RESUME: &str = "marxdown://tray-resume";

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

    // カスタム CSS も同じ理由でここ（02.architecture.md §10.3）。
    // **64KB 以下なら bootstrap に同梱する。** 後から当てると、ダークな背景を
    // 当てているときに白い初期画面が一瞬見える。読み取りは WebView 初期化と
    // 並行するので、クリティカルパスの時間は実質増えない（§5.1）。
    let custom_css_path = custom_css::custom_css_path(&context.config().identifier);
    let custom_css_data = custom_css::load(custom_css_path.as_deref(), custom_css::INLINE_LIMIT);

    // T2: ファイル読み込み。ウィンドウ生成の前に行い、WebView 初期化と重ねる。
    let payload = bootstrap::build(&args, &trace, &store_data, &settings_data, custom_css_data);
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
        settings_data,
        state::ConfigPaths {
            store: store_path,
            settings: settings_path,
            custom_css: custom_css_path,
        },
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
            // 先に前面化する。ユーザーが見ている画面が切り替わるほうが、
            // タブの追加より体感に効く。
            //
            // **トレイに格納されている場合もここを通る**（ADR-0007 論点 10）。
            // `restore` がサスペンドの解除まで面倒を見るので、
            // 「格納中に `marxdown foo.md`」が特別扱いにならない。
            close::restore(app);
            let _ = app.emit_to(window::MAIN_LABEL, EVENT_OPEN_REQUEST, &request);
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
            commands::store_set_panes,
            commands::read_settings,
            commands::write_settings,
            commands::open_settings_file,
            commands::read_custom_css,
            commands::open_custom_css_file,
            commands::watch_path,
            commands::unwatch_path,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::set_snap_layouts_target,
            commands::report_trace,
            commands::ready,
            commands::open_external,
            commands::open_local_file,
            commands::reveal_in_file_manager,
            commands::startup_trace,
            commands::warm_done,
            commands::app_quit,
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

            // Snap Layouts のサブクラス化は**ここではできない**。`hwnd()` は
            // イベントループへの問い合わせで、まだ回っていない（`snap_layouts.rs`）。
            // `ready` コマンドの中で付ける。
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
            // `custom.css` も同じ扱い（§10.3「外部エディタで編集されたら即反映」）。
            // **まだ存在しなくても登録する。** 親ディレクトリを見る形になるので、
            // 後から手で置かれた瞬間に拾える（`settings.json` と監視元を共有する）。
            if let Some(path) = state.custom_css_path() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::CustomCss);
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

            // `✕` / `Alt+F4`（ADR-0007 論点 2）。
            //
            // 何が起きるかの判断は `close.rs` に集約してある。ここは
            // 「止めるかどうか」だけを扱う。ウィンドウ位置の保存（F-CONF-10）も
            // 向こう側に移した。**格納でも終了でも保存が要る**（論点 11）ため、
            // このイベントだけに置いておけなくなった。
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if close::on_close_requested(window.app_handle()) {
                    api.prevent_close();
                }
            }
        })
        .run(context)
        .expect("error while running tauri application");
}
