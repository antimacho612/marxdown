//! Marxdown Core (Rust)
//!
//! 責務は 02.architecture/README.md 原則 C の 3 つに限定する。
//!
//! - ファイル I/O（速く、安全に、原子的に）
//! - OS 統合（CLI 引数、関連付け、単一インスタンス、ウィンドウ）
//! - フロントエンドより先に始められる仕事の先回り
//!
//! UI ロジックと Markdown の意味解釈は TypeScript 側にある。

pub mod asset;
mod bootstrap;
pub mod cli;
pub mod close;
pub mod commands;
pub mod custom_css;
pub mod dir;
mod document;
pub mod error;
pub mod scope;
pub mod settings;
/// Windows の Snap Layouts。Windows 以外では空になる（ファイル冒頭の `#![cfg(windows)]`）。
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
/// 02.architecture/05-startup-sequence.md §2 のウォーム起動。
/// この経路には WebView の初期化もバンドルの評価も Svelte のマウントも含まれない。
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

/// 転送された起動要求をフロントへ渡すイベント（ペイロードは [`OpenRequest`]）。
pub const EVENT_OPEN_REQUEST: &str = "marxdown://open-request";

/// 「外から 1 枚開かせる」を 1 か所に集める。
///
/// argv 転送（ADR-0004）とトレイの「最近開いたファイル」（ADR-0007 論点 6）は意味が同じである。
/// 別の入口を作ると、ウォーム起動の計測・履歴・通知のどれかが片方だけ抜ける。
/// フロント側で `open.ts` が 5 つの入口を集約しているのと同じ判断を Rust 側でも行う。
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
/// カスタムタイトルバーであるため、`□` と `❐` の描き分けはフロントが担当する。
/// 変化したときだけ通知する。
/// `Resized` はドラッグ中に毎フレーム発火するため、そのまま流すと不要な IPC が積み上がる。
pub const EVENT_WINDOW_MAXIMIZED: &str = "marxdown://window-maximized";

/// トレイメニューの「Marxdown を開く」。フロントの `openViaDialog` に載せる。
///
/// Rust 側でダイアログを表示しない。
/// `pick_file` は既にあるが、開いた結果の扱い（履歴・通知・相対パス解決）はフロントの `open.ts` に集約してある。
/// トレイから別経路で開くと、そこだけ処理が抜ける。
pub const EVENT_TRAY_OPEN: &str = "marxdown://tray-open";

/// トレイから復帰した瞬間（ADR-0007「計測項目」の Tray Resume）。
///
/// Warm Start（20.0ms）とは別の経路である。
/// Warm Start はウィンドウが可視のまま argv 転送を受けた場合の値で、こちらはサスペンドされた WebView が復帰して表示されるまでを測る。
/// 同じ指標として比較すると判断を誤る。
pub const EVENT_TRAY_RESUME: &str = "marxdown://tray-resume";

/// 終了の確認で「保存して終了」が選ばれた（F-EDIT-03 / `close.rs`）。
///
/// 保存できるのはフロントだけである（本文は Monaco の `ITextModel` にある）。
/// Rust は保存を依頼するだけで、成功したらフロントがもう一度終了を要求する。
pub const EVENT_SAVE_AND_QUIT: &str = "marxdown://save-and-quit";

/// アプリケーションの入口。`main()` から 1 回だけ呼ぶ。
///
/// 02.architecture/05-startup-sequence.md §1 の順序をそのまま実装する。
/// CLI 引数の解析、設定とストアの先読み、ウィンドウ生成、イベントループの起動まで行い、`--help` / `--version` のときだけ出力して戻る。
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

    // OQ-18 の切り分け用（`--gc-probe`）。
    //
    // 「`huge.md` を閉じてもメモリが解放されない」の候補 1 は「Blink / V8 が未回収なだけ」である。
    // これを検証するには強制 GC の後で測定する必要があるが、既定の WebView2 に `gc()` は無い。
    //
    // 既定では渡さない。
    // `--expose-gc` は本番で有効にする理由が無く、実行中のスクリプトから GC を呼べる経路を常設することになる。
    //
    // ウィンドウ生成より前に置くこと。WebView2 は環境変数を初期化時に読む。
    if args.gc_probe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--js-flags=--expose-gc",
        );
        eprintln!("[marxdown] --gc-probe: DevTools のコンソールで gc() を呼べます（OQ-18）");
    }

    let mut trace = trace::Trace::start(t0);
    trace.configure(args.trace_startup.clone(), args.exit_after_trace);
    trace.mark("T1", Some(format!("{} path(s)", args.paths.len())));

    // Context を先に作るのは、`identifier` からストアの置き場所を決めるためである。
    // `tauri::Manager::path()` は AppHandle 構築後にしか使えないが、ウィンドウ状態はウィンドウ生成の前に必要になる（window.rs）。
    let context = tauri::generate_context!();
    let store_path = store::store_path(&context.config().identifier);
    let store_data = store::load(store_path.as_deref());
    let restore_window = store_data.window;

    // 設定も同じ理由でここで読む。
    // 表示に影響する値（テーマ / 本文幅 / フォント）は本文を描画するより前に適用されている必要があり、後から適用すると FOUC になる（02.architecture/05-startup-sequence.md §1 の判断基準）。
    // 読むのは 1KB 未満のファイル 1 枚である。
    let settings_path = settings::settings_path(&context.config().identifier);
    let settings_data = settings::load(settings_path.as_deref());

    // カスタム CSS も同じ理由でここで読む（02.architecture/10-theming.md §3）。
    // 64KB 以下なら bootstrap に同梱する。
    // 後から適用すると、暗い背景を指定している場合に白い初期画面が一瞬表示される。
    // 読み取りは WebView 初期化と並行するため、クリティカルパスの時間は実質増えない（02.architecture/05-startup-sequence.md §1）。
    //
    // `custom.css` から `preview.css` への改名（ADR-0013）は読む前に 1 回だけ行う。
    // 面が 2 つになり「custom」が何を指すか名前から判別できなくなったための移行で、済んでいれば何もしない。
    // 失敗しても起動は止めない。
    custom_css::migrate_legacy(&context.config().identifier);

    let custom_css_path =
        custom_css::css_path(&context.config().identifier, custom_css::Surface::Preview);
    let custom_css_data = custom_css::load(custom_css_path.as_deref(), custom_css::INLINE_LIMIT);
    let editor_css_path =
        custom_css::css_path(&context.config().identifier, custom_css::Surface::Editor);
    let editor_css_data = custom_css::load(editor_css_path.as_deref(), custom_css::INLINE_LIMIT);

    // T2: ファイル読み込み。ウィンドウ生成の前に行い、WebView 初期化と重ねる。
    let payload = bootstrap::build(
        &args,
        &trace,
        &store_data,
        &settings_data,
        custom_css_data,
        editor_css_data,
    );
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
            editor_css: editor_css_path,
        },
    );

    let mut builder = tauri::Builder::default();

    // 単一インスタンス化は他のどのプラグインよりも先に登録する必要がある。
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
            // 先に前面化する。タブの追加よりも画面が切り替わることのほうが体感に影響する。
            //
            // トレイに格納されている場合もここを通る（ADR-0007 論点 10）。
            // `restore` がサスペンドの解除まで担当するため、格納中の `marxdown foo.md` を特別扱いしなくて済む。
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
            commands::write_asset,
            commands::list_dir,
            commands::list_files,
            commands::allow_image_dir,
            commands::pick_file,
            commands::pick_save_path,
            commands::set_dirty,
            commands::confirm_discard,
            commands::store_push_recent,
            commands::store_set_session,
            commands::store_remove_recent,
            commands::store_set_zoom,
            commands::store_set_panes,
            commands::store_set_split,
            commands::read_settings,
            commands::write_settings,
            commands::open_settings_file,
            commands::read_custom_css,
            commands::read_editor_css,
            commands::open_custom_css_file,
            commands::open_editor_css_file,
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
            commands::bench_input_done,
            commands::app_quit,
        ])
        .setup(move |app| {
            // T2b: Tauri のブートとプラグイン初期化が終わった時点。
            // T2→T3 が伸びたときに、WebView2 と自分たちが追加した処理のどちらが原因かを切り分けられるようにする（05.performance-budget/05-operations.md §2）。
            let state = app.state::<state::AppState>();
            state.trace.mark("T2b", None);

            // bootstrap で開いた初期ドキュメントは IPC（read_document）を経由しないため、
            // ここで改めて Tauri 本体の asset プロトコルスコープに登録しないと
            // 最初に開いたファイルの相対パス画像が 403 になる。
            for root in state.asset_roots() {
                let _ = app.asset_protocol_scope().allow_directory(root, true);
            }

            // ファイル監視（02.architecture/04-rust-responsibilities.md §4）。ウィンドウを作る前に `manage` する。
            // WebView が動き出した直後の `watch_path` が、まだ管理されていない状態を参照しないようにするためである。
            // ここで発生するのはスレッド 1 本の生成だけで、ファイル I/O は伴わない（実際の監視対象は下で決める）。
            app.manage(watch::FileWatcher::start(app.handle().clone()));

            // Snap Layouts のサブクラス化はここでは実行できない。
            // `hwnd()` はイベントループへの問い合わせであり、この時点ではまだ動作していない（`snap_layouts.rs`）。
            // サブクラス化は `ready` コマンドの中で行う。
            let main = window::create(app.handle(), window::MAIN_LABEL, &payload, restore_window)?;
            state.trace.mark("T3", None);

            // 矩形の受け皿だけはここで用意する（`snap_layouts.rs` の `prepare`）。
            // フロントは 1 度だけ矩形を送信し、以後はウィンドウ幅が変わるまで送り直さない（`src/app/window.ts` の `reportSnapLayoutsTarget`）。
            // その 1 度を受け取れないと、矩形は 0 のままになる。
            // イベントループを必要としない処理であるため、ここに置いてよい。
            #[cfg(windows)]
            snap_layouts::prepare(app.handle(), &main);
            #[cfg(not(windows))]
            let _ = main;

            // 監視の登録は T3 の後。ここから先は「本文が読める」までの経路に載らない
            // （02.architecture/05-startup-sequence.md §1 の判断基準: IPC を伴わず、遅れても最悪 300ms 反映が遅れるだけ）。
            //
            // 開いているドキュメントの登録はフロントが `watch_path` で行う。
            // `settings.json` だけは Rust 側で登録する。
            // パスを知っているのは Rust 側だけであり、フロントに取得させると IPC が 1 往復増える（02.architecture/04-rust-responsibilities.md §5）。
            if let Some(path) = state.settings_path() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::Settings);
            }
            // `custom.css` も同じ扱い（02.architecture/10-theming.md §3「外部エディターで編集されたら即反映」）。
            // まだ存在しなくても登録する。
            // 親ディレクトリを監視する形になるため、後から作成された時点で検出できる（`settings.json` と監視元を共有する）。
            if let Some(path) = state.custom_css_path() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::CustomCss);
            }
            // `editor.css` も同じ（ADR-0013）。
            // 3 つ目の共有者になるが、監視元は親ディレクトリ 1 つのままで、仕組みは増えない。
            if let Some(path) = state.editor_css_path() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::EditorCss);
            }

            Ok(())
        })
        // ウィンドウ位置・サイズの保存（F-CONF-10）。
        //
        // 閉じる瞬間にだけ書く。
        // 移動・リサイズのたびに書くと、ウィンドウをドラッグしている間ずっとファイル I/O が発生する。
        .on_window_event(|window, event| {
            if window.label() != window::MAIN_LABEL {
                return;
            }

            // 最大化状態の変化をフロントへ通知する（ウィンドウ操作ボタンの表示）。
            //
            // ボタンを押したときだけでなく、`Win+↑` / ダブルクリック / 上端へのドラッグでも変化する。
            // 操作した側で状態を持たず OS の状態を唯一の情報源とすることで、経路が増えても表示がずれない。
            // 変化の判定は `AppState` が持つ。
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let now = window.is_maximized().unwrap_or(false);
                if window.state::<state::AppState>().note_maximized(now) {
                    let _ = window.emit(EVENT_WINDOW_MAXIMIZED, now);
                }
                return;
            }

            // `✕` / `Alt+F4`（ADR-0007 論点 2）。
            //
            // 何が起きるかの判断は `close.rs` に集約してあり、ここでは中断するかどうかだけを扱う。
            // ウィンドウ位置の保存（F-CONF-10）も `close.rs` へ移した。
            // 格納でも終了でも保存が必要になり（論点 11）、このイベントだけに置いておけなくなったためである。
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if close::on_close_requested(window.app_handle()) {
                    api.prevent_close();
                }
            }
        })
        .run(context)
        .expect("error while running tauri application");
}
