//! Marxdown Core (Rust)
//!
//! 責務は 02.architecture/01-principles.md 原則 C の 3 つに限定する。
//!
//! - ファイル I/O（速く、安全に、原子的に）
//! - OS 統合（CLI 引数、関連付け、単一インスタンス、ウィンドウ）
//! - フロントエンドより先に始められる仕事の先回り
//!
//! UI ロジックと Markdown の意味解釈は TypeScript 側にある。

pub mod asset;
mod autostart;
mod bootstrap;
pub mod cli;
pub mod close;
pub mod commands;
pub mod dir;
mod document;
/// タブのドラッグ中にカーソルへ追従する表示。Windows 以外では空になる（ファイル冒頭の `#![cfg(windows)]`）。
pub mod drag_ghost;
pub mod error;
mod export;
pub mod fsops;
pub mod glob;
pub mod marp_themes;
pub mod path_env;
pub mod scope;
pub mod settings;
/// Windows の Snap Layouts。Windows 以外では空になる（ファイル冒頭の `#![cfg(windows)]`）。
pub mod snap_layouts;
pub mod state;
mod stdin;
pub mod store;
pub mod tab_drag;
pub mod themes;
pub mod trace;
pub mod tray;
pub mod update;
pub mod watch;
pub mod webview;
pub mod window;

use std::path::Path;
use std::time::Instant;

use tauri::{Emitter, Manager};

/// 別インスタンスから転送された起動要求（ADR-0004）。
///
/// 02.architecture/05-startup-sequence.md §3 のウォーム起動。
/// この経路には WebView の初期化もバンドルの評価も Svelte のマウントも含まれない。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    /// この要求の計測 ID。フロントは描画完了後に `warm_done` へ返す。
    pub request_id: u64,
    pub paths: Vec<String>,
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
        mode: None,
        trace: false,
    };
    let _ = app.emit_to(target_window(app).as_str(), EVENT_OPEN_REQUEST, &request);
}

/// 「外から 1 枚開かせる」経路の宛先（F-OPEN-06）。
///
/// 最後にフォーカスされたウィンドウへ送る。
/// 主ウィンドウ決め打ちにすると、ユーザーが見ている手前のウィンドウではない場所にタブが増える。
///
/// 記録しているウィンドウが既に閉じていれば、主ウィンドウ、それも無ければ残っている 1 枚へ倒す。
/// 存在しないラベルを返してはいけない。
/// トレイからの復帰（`close::restore`）もここを通るため、宛先が実在しないとトレイに格納したまま二度と出せなくなる。
pub fn target_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> String {
    let focused = app
        .try_state::<state::AppState>()
        .map(|s| s.focused_label())
        .unwrap_or_else(|| window::MAIN_LABEL.to_owned());

    if app.get_webview_window(&focused).is_some() {
        return focused;
    }
    if app.get_webview_window(window::MAIN_LABEL).is_some() {
        return window::MAIN_LABEL.to_owned();
    }

    // 残っている 1 枚。ラベル順で選ぶのは、複数残っている場合に毎回同じ結果を返すためである。
    let mut labels = app.webview_windows().into_keys().collect::<Vec<_>>();
    labels.sort_unstable();
    labels
        .into_iter()
        .next()
        .unwrap_or_else(|| window::MAIN_LABEL.to_owned())
}

/// サテライトウィンドウを 1 枚作る（F-OPEN-06 / ADR-0004「1 プロセスが複数ウィンドウを持てる」）。
///
/// 生成したウィンドウのラベルを返す。
/// タブと本文だけを持つウィンドウで、ファイルツリーもアウトラインもハンバーガーメニューも持たない（[`bootstrap::WindowRole`]）。
///
/// ウィンドウを作る手順そのものは起動時の 1 枚目と同じ `window::create` である。
/// 違うのは 2 点だけで、`CliArgs` を argv ではなく引数から組み立てることと、前回のタブを復元しないことである。
///
/// 前回のタブ（`state.json` の `session`）は復元しない。
/// 復元は「引数なしで起動したとき」の振る舞いであり（`bootstrap::build`）、明示的に開いたウィンドウに前回の 8 枚が現れるのは意図と違う。
/// セッションを空にしたストアを渡すことで、その分岐に入らないようにしてある。
///
/// ウィンドウ位置は保存しない（`close.rs` の `save_window_state`）。
/// 覚えるのは主ウィンドウの分だけで、サテライトは閉じたら消える。
///
/// Windows では WebView2 のイベントハンドラの中から呼んではならない（`commands::open_satellite`）。
/// 同期コマンドがこれにあたり、ウィンドウの生成がデッドロックする。
pub fn open_satellite(
    app: &tauri::AppHandle,
    state: &state::AppState,
    paths: Vec<String>,
    mode: Option<cli::ViewMode>,
    transfer: Option<u64>,
    placement: Option<store::WindowState>,
) -> tauri::Result<String> {
    let args = cli::CliArgs {
        paths: paths.iter().map(std::path::PathBuf::from).collect(),
        mode,
        ..cli::CliArgs::default()
    };

    let store = store::StoreData {
        session: store::Session::default(),
        ..state.store_snapshot()
    };
    let settings = state.settings_snapshot();
    let preview_theme = themes::find(state.themes_dir(), &settings.values.preview_theme);

    // 起動計測は 1 枚目だけを対象にするため、無効な計測を渡す（`commands::ready`）。
    let trace = trace::Trace::start(Instant::now());
    let mut payload = bootstrap::build(&args, &trace, &store, &settings, preview_theme);
    payload.role = bootstrap::WindowRole::Satellite;
    payload.transfer = transfer;

    let label = state.next_window_label();
    window::create(app, &label, &payload, placement)?;

    // 開いたファイルの親ディレクトリをアセットの許可スコープに入れる（N-SEC-05）。
    //
    // 起動時の 1 枚目と同じ処理である（`run()` の `setup`）。
    // bootstrap で開いたドキュメントは `read_document` を経由しないため、ここで登録しないと相対パスの画像が 403 になる。
    let roots = payload
        .document
        .as_ref()
        .and_then(|d| {
            std::path::Path::new(&d.meta.path)
                .parent()
                .map(Path::to_path_buf)
        })
        .into_iter()
        .chain(
            payload
                .workspace_root
                .as_ref()
                .map(std::path::PathBuf::from),
        );

    for root in roots {
        state.allow_asset_root(root.clone());
        let _ = app.asset_protocol_scope().allow_directory(&root, true);
    }

    Ok(label)
}

/// 別のウィンドウから移されてきたタブ（OQ-43）。
///
/// 中身はサテライトへ移すときと同じである（ADR-0016 §3.4）。
/// ディスクと一致しているタブはパスだけ、未保存か無題のタブは受け渡し箱の ID だけを運ぶ。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabArrival {
    pub paths: Vec<String>,
    pub transfer: Option<u64>,
}

/// タブが移されてきたことを、移す先のウィンドウへ知らせるイベント（ペイロードは [`TabArrival`]）。
pub const EVENT_TAB_ARRIVE: &str = "marxdown://tab-arrive";

/// タブを既にあるウィンドウへ渡す（OQ-43）。
///
/// 渡す先がトレイに格納されている・最小化されている場合は、先に前面へ出す（`close::bring_forward`）。
/// 出さないと、元のウィンドウからタブが消えるだけで、どこへ移ったのかが見えない。
///
/// 渡す先が無ければ何も送らずに `false` を返す。
/// そのとき呼び出し側は元のタブを閉じてはいけない。
pub fn send_tab<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    target: &str,
    arrival: &TabArrival,
) -> bool {
    if app.get_webview_window(target).is_none() {
        return false;
    }
    // 先に前面へ出す。
    // トレイ格納中の WebView はサスペンドされており、復帰させないとイベントを受け取ってもスクリプトが動かない（`webview.rs`）。
    close::bring_forward(app, target);
    app.emit_to(target, EVENT_TAB_ARRIVE, arrival).is_ok()
}

/// 最大化状態が変わったことをフロントへ知らせる（ペイロードは `bool`）。
///
/// カスタムタイトルバーであるため、`□` と `❐` の描き分けはフロントが担当する。
/// 変化したときだけ通知する。
/// `Resized` はドラッグ中に毎フレーム発火するため、そのまま送ると不要な IPC が蓄積する。
pub const EVENT_WINDOW_MAXIMIZED: &str = "marxdown://window-maximized";

/// トレイメニューの「Marxdown を開く」。フロントの `openViaDialog` に載せる。
///
/// Rust 側でダイアログを表示しない。
/// `pick_file` は既にあるが、開いた結果の扱い（履歴・通知・相対パス解決）はフロントの `open.ts` に集約してある。
/// トレイから別経路で開くと、そこだけ処理が抜ける。
pub const EVENT_TRAY_OPEN: &str = "marxdown://tray-open";

/// トレイから復帰した瞬間（ADR-0007「計測項目」の Tray Resume）。
///
/// Warm Start とは別の経路である。
/// Warm Start はウィンドウが可視のまま argv 転送を受けた場合の値で、こちらはサスペンドされた WebView が復帰して表示されるまでを測る。
/// 同じ指標として比較すると判断を誤る。
pub const EVENT_TRAY_RESUME: &str = "marxdown://tray-resume";

/// 終了の確認で「保存して終了」が選ばれた（F-EDIT-03 / `close.rs`）。
///
/// 保存できるのはフロントだけである（本文は Monaco の `ITextModel` にある）。
/// Rust は保存を依頼するだけで、成功したらフロントがもう一度終了を要求する。
pub const EVENT_SAVE_AND_QUIT: &str = "marxdown://save-and-quit";

/// ウィンドウを閉じる確認で「保存して閉じる」が選ばれた（F-OPEN-06 / `close.rs`）。
///
/// [`EVENT_SAVE_AND_QUIT`] と同じ構造で、保存した後の行き先だけが違う。
/// フロントは保存に成功したらもう一度そのウィンドウを閉じる。
pub const EVENT_SAVE_AND_CLOSE: &str = "marxdown://save-and-close";

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
    // インストーラが終了コードで成否を判定する（`windows/installer-hooks.nsh`）。
    if let Some(op) = args.path_op {
        std::process::exit(path_env::run(op));
    }
    // `-`: 標準入力を書き出して起動し直す（`stdin.rs`）。
    // このプロセスはシムがフォアグラウンドで実行しており、常駐させるとシェルが返らない。
    if args.stdin {
        let argv: Vec<String> = std::env::args().skip(1).collect();
        std::process::exit(stdin::run(&argv));
    }

    // `--gc-probe`: メモリ計測で強制 GC を使うための経路（05.performance-budget/05-operations.md §3）。
    // 閉じた文書のメモリが解放されるかを確かめるには強制 GC の後で測る必要があるが、既定の WebView2 に `gc()` は無い。
    //
    // 既定では渡さない。
    // `--expose-gc` は本番で有効にする理由が無く、実行中のスクリプトから GC を呼べる経路を常設することになる。
    //
    // WARNING: ウィンドウ生成より前に置くこと。WebView2 は環境変数を初期化時に読む。
    if args.gc_probe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--js-flags=--expose-gc",
        );
        eprintln!("[marxdown] --gc-probe: DevTools のコンソールで gc() を呼べます");
    }

    let mut trace = trace::Trace::start(t0);
    trace.configure(args.trace_startup.clone(), args.exit_after_trace);
    trace.mark("T1", Some(format!("{} path(s)", args.paths.len())));

    // Context を先に作るのは、`identifier` からストアの置き場所を決めるためである。
    // `tauri::Manager::path()` は AppHandle 構築後にしか使えないが、ウィンドウ状態はウィンドウ生成の前に必要になる（window.rs）。
    let context = tauri::generate_context!();
    store::migrate_legacy_dir(&context.config().identifier);
    let store_path = store::store_path(&context.config().identifier);
    let store_data = store::load(store_path.as_deref());
    let restore_window = store_data.window;

    // 設定も同じ理由でここで読む。
    // 表示に影響する値（テーマ / 本文幅 / フォント / 配色）は本文を描画するより前に適用されている必要があり、後から適用すると FOUC になる（02.architecture/05-startup-sequence.md §2 の判断基準）。
    // 読むのは 1KB 未満のファイル 1 枚である。
    //
    // 古いバージョンが使っていたカスタム CSS（`preview.css` / `editor.css`）を `themes/` へ移す。設定を読むより前に行う。
    // 常時適用されていた 1 枚が選択制の配色になるため、移すだけでは配色が外れる。
    // 設定が既定のままであれば移した先を選んだ状態にして、見た目を引き継ぐ。
    let migrated = themes::migrate_legacy_css(&context.config().identifier);

    let settings_path = settings::settings_path(&context.config().identifier);
    let mut settings_data = settings::load(settings_path.as_deref());

    // ログイン時の自動起動（ADR-0022）。トレイに格納できない設定では、見えないプロセスが残るだけになる。
    if args.background && !settings_data.values.window_close_to_tray {
        return;
    }

    if settings_data.broken.is_none() {
        let mut changed = false;
        if migrated.preview && settings_data.values.preview_theme == settings::DEFAULT_THEME_ID {
            settings_data.values.preview_theme = themes::MIGRATED_PREVIEW_ID.to_owned();
            changed = true;
        }
        if migrated.editor && settings_data.values.editor_theme == settings::DEFAULT_THEME_ID {
            settings_data.values.editor_theme = themes::MIGRATED_EDITOR_ID.to_owned();
            changed = true;
        }
        // 書けなくても続ける。この起動のあいだは移した先が適用され、次の起動で既定に戻るだけである。
        if let (true, Some(path)) = (changed, settings_path.as_deref()) {
            let _ = settings::save(path, &settings_data.values);
        }
    }

    // 配色の置き場所。ディレクトリが存在しないと、後から置かれたファイルを監視で検出できない。
    let themes_dir = themes::themes_dir(&context.config().identifier);
    if let Some(dir) = themes_dir.as_deref() {
        let _ = std::fs::create_dir_all(dir);
    }

    // プレビューで選ばれている 1 枚だけを bootstrap へ載せる（ADR-0014）。
    // プレビューは起動直後から見えている面であり、後から適用すると既定の配色で初回フレームが描かれる。
    // 読み取りは WebView 初期化と並行するため、クリティカルパスの時間は実質増えない（02.architecture/05-startup-sequence.md §1）。
    //
    // エディター側は載せない。
    // 既定の表示モードは Preview で、`#mx-editor` は Monaco がマウントされるまで空であるため、遅れて適用しても未適用の配色が見えることがない。
    let preview_theme = themes::find(themes_dir.as_deref(), &settings_data.values.preview_theme);

    // T2: ファイル読み込み。ウィンドウ生成の前に行い、WebView 初期化と重ねる。
    let mut payload = bootstrap::build(&args, &trace, &store_data, &settings_data, preview_theme);
    trace.mark(
        "T2",
        payload
            .document
            .as_ref()
            .map(|d| format!("{} bytes, inlined={}", d.meta.size, d.content.is_some())),
    );

    let stdin_file = args.stdin_file.clone();
    let state = state::AppState::new(
        args,
        trace,
        &payload,
        store_data,
        settings_data,
        state::ConfigPaths {
            store: store_path,
            settings: settings_path,
            themes: themes_dir,
        },
    );

    // 標準入力は、未保存のタブをサテライトへ移すときと同じ受け渡し箱で渡す（ADR-0016 §3.4）。
    // パスを持たない文書は `read_document` で読み直せないため、本文ごと預ける必要がある。
    if let Some(file) = stdin_file {
        match stdin::take(&file) {
            Ok(transfer) => payload.transfer = Some(state.stash_transfer(transfer)),
            Err(e) => {
                payload.document_error = Some(bootstrap::BootstrapError {
                    path: "-".to_owned(),
                    kind: e.kind().to_string(),
                    message: e.to_string(),
                });
            }
        }
    }

    let mut builder = tauri::Builder::default();

    // 単一インスタンス化は他のどのプラグインよりも先に登録する必要がある。
    // 2 番目のプロセスは、ここでコールバックを実行したあと即座に終了する。
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let forwarded = cli::parse(
                &argv.into_iter().skip(1).collect::<Vec<_>>(),
                std::path::Path::new(&cwd),
            );
            // ログイン時の自動起動が、既に常駐しているプロセスへ届いた（ADR-0022）。
            // 前面へ出すと、ログインのたびにウィンドウが現れる。
            if forwarded.background {
                return;
            }

            // W0。argv 転送を受けた瞬間。ここから「本文が読める」までがウォーム起動。
            let request_id = app.state::<state::AppState>().begin_warm();
            let paths = forwarded
                .paths
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>();

            let request = OpenRequest {
                request_id,
                paths,
                mode: forwarded.mode,
                trace: forwarded.trace_startup.is_some(),
            };
            // 先に前面化する。タブの追加よりも画面が切り替わることのほうが体感に影響する。
            //
            // トレイに格納されている場合もここを通る（ADR-0007 論点 10）。
            // `restore` がサスペンドの解除まで担当するため、格納中の `marxdown foo.md` を特別扱いしなくて済む。
            close::restore(app);
            let target = target_window(app);
            let _ = app.emit_to(target.as_str(), EVENT_OPEN_REQUEST, &request);

            // 標準入力（`stdin.rs`）。起動時と同じ受け渡し箱を使い、他のウィンドウから移されてきたタブとして届ける。
            // 失敗を知らせる画面上の経路が無いため、標準エラーへ書くだけにする。
            if let Some(file) = forwarded.stdin_file.as_deref() {
                match stdin::take(file) {
                    Ok(transfer) => {
                        let id = app.state::<state::AppState>().stash_transfer(transfer);
                        send_tab(
                            app,
                            &target,
                            &TabArrival {
                                paths: Vec::new(),
                                transfer: Some(id),
                            },
                        );
                    }
                    Err(e) => eprintln!("[marxdown] 標準入力を開けませんでした: {e}"),
                }
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 初期化で行うのは設定の読み取りだけで、通信は `ready` の後まで始まらない（`update.rs`）。
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .manage(update::Updates::default())
        .manage(tab_drag::TabDrag::default())
        .invoke_handler(tauri::generate_handler![
            commands::read_document,
            commands::write_document,
            commands::resolve_asset,
            commands::write_asset,
            commands::list_dir,
            commands::list_files,
            commands::allow_image_dir,
            commands::pick_file,
            commands::pick_folder,
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
            commands::list_user_themes,
            commands::open_themes_dir,
            commands::read_marp_themes,
            commands::watch_path,
            commands::unwatch_path,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::set_snap_layouts_target,
            commands::open_satellite,
            commands::stash_transfer,
            commands::take_transfer,
            commands::move_tab_to_window,
            commands::tab_drag_begin,
            commands::tab_drag_move,
            commands::tab_drag_end,
            commands::report_trace,
            commands::ready,
            commands::open_external,
            commands::open_local_file,
            commands::reveal_in_file_manager,
            commands::create_entry,
            commands::rename_entry,
            commands::move_entries,
            commands::copy_entries,
            commands::trash_entries,
            commands::import_dropped,
            commands::open_dropped_folder,
            commands::watch_tree,
            commands::confirm_action,
            commands::startup_trace,
            commands::warm_done,
            commands::bench_input_done,
            commands::app_quit,
            commands::check_update,
            commands::install_update,
            export::export_html,
            export::export_pdf,
            export::inline_image,
        ])
        .setup(move |app| {
            // T2b: Tauri のブートとプラグイン初期化が終わった時点。
            // T2→T3 が伸びたときに、WebView2 と自分たちが追加した処理のどちらが原因かを切り分けられるようにする（05.performance-budget/05-operations.md §2）。
            let state = app.state::<state::AppState>();
            state.trace.mark("T2b", None);

            // bootstrap で開いた初期ドキュメントは IPC（read_document）を経由しないため、ここで改めて Tauri 本体の asset プロトコルスコープに登録しないと最初に開いたファイルの相対パス画像が 403 になる。
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

            // 監視の登録は T3 の後。ここから先は「本文が読める」までの経路に載らない（02.architecture/05-startup-sequence.md §2 の判断基準: IPC を伴わず、遅れても最悪 300ms 反映が遅れるだけ）。
            //
            // 開いているドキュメントの登録はフロントが `watch_path` で行う。
            // `settings.json` だけは Rust 側で登録する。
            // パスを知っているのは Rust 側だけであり、フロントに取得させると IPC が 1 往復増える（02.architecture/04-rust-responsibilities.md §5）。
            if let Some(path) = state.settings_path() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::Settings);
            }
            // 配色のディレクトリも同じ扱い（02.architecture/10-theming.md §3.4）。
            // 中身が増減しても編集されても読み直す。
            if let Some(path) = state.themes_dir() {
                app.state::<watch::FileWatcher>()
                    .watch(path, watch::Role::Themes);
            }

            Ok(())
        })
        // ウィンドウ位置・サイズの保存（F-CONF-10）。
        //
        // 閉じる瞬間にだけ書く。
        // 移動・リサイズのたびに書くと、ウィンドウをドラッグしている間ずっとファイル I/O が発生する。
        .on_window_event(|window, event| {
            let label = window.label().to_owned();

            // ドロップされたパスを覚えておく（02.architecture/09-security.md §5）。
            // ファイルツリーへの取り込みは、ここで受け取ったパスだけを複製元にする。
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                window
                    .state::<state::AppState>()
                    .note_drop(&label, paths.clone());
                return;
            }

            // 最大化状態の変化をフロントへ通知する（ウィンドウ操作ボタンの表示）。
            //
            // ボタンを押したときだけでなく、`Win+↑` / ダブルクリック / 上端へのドラッグでも変化する。
            // 操作した側で状態を持たず OS の状態を唯一の情報源とすることで、経路が増えても表示がずれない。
            // 変化の判定は `AppState` が持つ。
            //
            // 宛先はこのウィンドウ 1 枚に限る（F-OPEN-06）。
            // `emit` は全ウィンドウへ配るため、別のウィンドウのボタンまで `❐` に変わる。
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let now = window.is_maximized().unwrap_or(false);
                if window
                    .state::<state::AppState>()
                    .note_maximized(&label, now)
                {
                    let _ = window.emit_to(label.as_str(), EVENT_WINDOW_MAXIMIZED, now);
                }
                return;
            }

            // 「外から 1 枚開かせる」経路の宛先を更新する（`target_window`）。
            if let tauri::WindowEvent::Focused(true) = event {
                window.state::<state::AppState>().note_focused(&label);
                // 常駐したまま使われ続ける場合の更新の確認（ADR-0024 §3.4）。行うのは時刻の比較だけである。
                update::on_focus(window.app_handle());
                return;
            }

            // 閉じ終わったウィンドウの分の記録を破棄する（N-PERF-06）。
            //
            // 常駐するアプリであるため、ウィンドウを閉じてもプロセスは残る。
            // ここで破棄しないと、閉じたウィンドウのダーティが終了の確認に影響し続け、監視と Snap Layouts の受け皿も増え続ける。
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let app = window.app_handle();
                app.state::<state::AppState>().forget_window(&label);
                app.state::<watch::FileWatcher>().release_window(&label);
                #[cfg(windows)]
                snap_layouts::forget(app, &label);
                // タブを引き出している途中で、引き出した側が閉じた。
                // 表示を消す指示を送る側がもういないため、ここで消す。
                if app.state::<tab_drag::TabDrag>().forget(&label) {
                    #[cfg(windows)]
                    let _ = app.run_on_main_thread(drag_ghost::hide);
                }
                return;
            }

            // `✕` / `Alt+F4`（ADR-0007 論点 2）。
            //
            // 何が起きるかの判断は `close.rs` に集約してあり、ここでは中断するかどうかだけを扱う。
            // ウィンドウ位置の保存（F-CONF-10）も `close.rs` が行う。
            // 格納でも終了でも保存が必要であり（ADR-0007 論点 11）、このイベントだけでは足りないためである。
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if close::on_close_requested(window.app_handle(), &label) {
                    api.prevent_close();
                }
            }
        })
        .run(context)
        .expect("error while running tauri application");
}
