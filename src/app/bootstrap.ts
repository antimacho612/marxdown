/**
 * 起動シーケンス（02.architecture/05-startup-sequence.md §1）。
 *
 * パースをシェル描画より前に開始し、その取得・評価とシェル描画を重ねる（`openDocument` の `betweenParseAndPaint` / ADR-0010）。
 * 開く経路自体は `features/document/open.ts` に一本化されており、このファイルは起動固有の処理（bootstrap 読み取り・ウィンドウ表示・購読登録）のみを扱う。
 */
import {
  configureOpener,
  documentStore,
  installFileWatch,
  openDocument,
  openPath,
  previewScrollTop,
  saveThenQuit,
} from '@/features/document';
import { mountEditorLazily, preloadEditor, setSplitSyncLazily } from '@/features/editor';
import { configureHistory } from '@/features/history';
import { decideInitialMode, initMode } from '@/features/mode';
import { initPanes } from '@/features/panes';
import { applyZoom, installLinkHandler } from '@/features/preview';
import {
  applyCustomCss,
  initSettings,
  installSettingsWatch,
  reportSettingsProblem,
  settingsStore,
} from '@/features/settings';
import { initSplit, viewStore } from '@/features/view';
import {
  openPathsInTabs,
  recentStore,
  restoreSession,
  setTreeRoot,
  watchSession,
  workspaceOpenerHooks,
} from '@/features/workspace';
import { ja } from '@/i18n/ja';
import { runCommand } from '@/lib/commands';
import { toMessage } from '@/lib/error';
import { requestIdle } from '@/lib/idle';
import { adoptT4, drain, initTrace, isTracing, mark } from '@/lib/trace';
import { createParser } from '@/markdown/parser';
import { getPlatform, type Bootstrap, type DocumentPayload } from '@/platform';

import { installCommands } from './commands';
import { installSoftBreakRerender } from './watch-render-settings.svelte';
import { installWindowState, reportSnapLayoutsTarget } from './window';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * bootstrap を読む。同期的に読めることが最も重要である（02.architecture/05-startup-sequence.md §1 の要点 2）。
 *
 * `invoke()` の往復を待つと、WebView の準備完了・リクエスト・レスポンスという最低 1 往復が本文表示の前に挟まる。
 */
export function readBootstrap(): Bootstrap | null {
  return getPlatform().getBootstrap();
}

/**
 * 起動シーケンスを実行する。`main.ts` から 1 回だけ呼ぶ。
 *
 * `renderShell` はシェル（タイトルバー / ステータスバー）を描画するコールバックである。
 * 本文があるときは `openDocument` がパースの送信直後に呼び出し、無いときはこの関数が直接呼ぶ。
 * どちらの経路でも 1 回しか実行されない。
 */
export async function startup(renderShell: () => void): Promise<void> {
  const platform = getPlatform();

  const bootstrap = readBootstrap();
  initTrace(bootstrap?.trace ?? null);
  adoptT4();
  mark('T5', bootstrap?.document ? `${bootstrap.document.size} bytes` : 'no document');

  // ここから customCss/editorCss の取得までは、すべて本文を描くより前に適用する。
  // 後から適用すると、本文が描画された直後に見た目が変化する瞬間が生じる
  // （F-VIEW-11 / F-NAV-04 / 03.ux-spec/06-panes.md §3 / 02.architecture/04-rust-responsibilities.md §5）。
  applyZoom(bootstrap?.zoom ?? 1, false);
  recentStore.entries = bootstrap?.recent ?? [];

  // `marxdown <dir>` で開いたフォルダ（F-OPEN-02）。
  // 決まっていればファイルツリーの基点になり、開いているファイルの親ディレクトリでは上書きされない。
  // ここでは値を入れるだけで、読み込むのはペインを開いたときである（`Explorer.svelte`）。
  if (bootstrap?.workspaceRoot) void setTreeRoot(bootstrap.workspaceRoot);

  // 後から適用すると、本文が一度全幅で描画された後に幅が縮小して見える。
  // ここで設定した値は、この下の `renderShell()` が描く最初のシェルに既に反映されている
  // （シェルの描画は本文の paint より前 / `betweenParseAndPaint`）。
  initPanes(bootstrap);
  // 後から適用すると、`--mode split` で開いたときに 50:50 の状態が一度描画された後に分割比が変化して見える（03.ux-spec/03-split-mode.md §1）。
  initSplit(bootstrap);

  // bootstrap に丸ごと含まれているため IPC 往復は発生しない（02.architecture/05-startup-sequence.md §1）。
  // テーマ・フォント・本文幅は `initSettings` の中で同期的に CSS 変数へ反映される。
  // 後から適用すると、一度描画された内容が別の見た目に再描画される。
  initSettings(bootstrap);

  // 64KB 以下なら bootstrap に同梱されて届く（F-CONF-07 / 02.architecture/10-theming.md §3）。
  // ここで当てないと、ダークな背景を指定している人の画面で白い初期画面が一瞬見える。
  // 包めなかった場合は当てずに結果だけ返す（通知は `ready()` の後）。
  const customCss = bootstrap?.customCss ?? null;
  const customCssResult = applyCustomCss(customCss?.css ?? null);
  // エディター用も同じ扱いである（ADR-0013）。
  // エディターが未マウントでも適用しておく（適用されるのはトークンであり、Monaco はマウント時にそれを読み出す）。
  // 適用を遅らせると、Edit で開いた最初の 1 フレームだけ既定の配色で表示される。
  const editorCss = bootstrap?.editorCss ?? null;
  const editorCssResult = applyCustomCss(editorCss?.css ?? null, 'editor');

  // 開けた結果を受け取る側も渡す（`features/workspace/opened.ts`）。
  // タブと最近開いたファイルはどちらも workspace の持ち物であり、依存を workspace → document の 1 方向に保つために注入で繋ぐ。
  configureOpener({
    parser: createParser(),
    softBreak: () => settingsStore.values['preview.softBreak'],
    ...workspaceOpenerHooks(),
  });

  // 履歴を辿るときの開き直し（F-NAV-07）。引数の意味はここでしか決まらない。
  //
  // 履歴を辿る移動そのものは履歴に積まない（積むと二度と抜け出せない）。
  // 最近開いたファイル（F-OPEN-09）の順序は「最後に開いた順」であって
  // 「最後に見た順」ではないので、戻っただけでは先頭に来ない。
  configureHistory({
    scrollTop: previewScrollTop,
    reopen: async (path, scrollTop) =>
      Boolean(await openPath(path, { resetScroll: false, restoreScroll: scrollTop, history: false, remember: false })),
  });

  // リンクハンドラとキーバインドは本文を描くより前に登録する。
  //
  // リンクを後回しにすると、パースが失敗した状態や描画が停止した状態でリンクを押されたときに、ブラウザ既定の遷移が発生する。
  // WebView がページ遷移するとアプリのシェルごと差し替わり、復帰する手段が無い（N-SEC-04）。
  // そのため、塞ぐ側を先に登録する。
  //
  // キーバインドを後回しにすると、`extreme.md` のような重いファイルを描画している間 `Ctrl+O` が動作しない。
  // 描画の完了を待たずに別のファイルを開けることは、この経路で担保する。
  //
  // どちらもリスナーの登録だけで IPC を伴わないため、クリティカルパスへの追加コストは無視できる
  // （IPC を伴う購読は下の `ready()` の後に置いてある）。
  //
  // コマンドの登録もここで行う。
  // メニューより先に済んでいる必要がある（`features/menu` は id しか持たず、実体はこの登録を参照する / `commands.ts`）。
  installLinks();
  installCommands();

  // シェルは、本文があってもなくても同じ場所で描く。
  // 本文がある場合は `openDocument` がパース送信の直後に呼び出す。
  let shellRendered = false;
  const renderShellOnce = () => {
    if (shellRendered) return;
    shellRendered = true;
    renderShell();
  };

  const initial = await resolveInitialDocument(bootstrap);

  // 表示モードも本文を描くより前に適用する（F-MODE-07 / 倍率・ペインと同じ理由）。
  // 後から適用すると、Preview の面が 1 フレーム描画されてからエディターへ差し替わる。
  //
  // `--mode edit` で起動しても、ここではまだ `editor` チャンクを取得しない。
  // 属性を設定するだけであり、クリティカルパスは増えない。
  // 実体は下の `installInitialEditor()` が `ready()` の後で読み込む。
  initMode(decideInitialMode(bootstrap, initial));

  if (initial) {
    await openDocument(initial, { trace: true, betweenParseAndPaint: renderShellOnce });
  } else {
    renderShellOnce();
  }

  // 通知は本文を描いた後に出す。
  // `openDocument` は描画に成功した時点で通知バーを閉じる（開けなかったことを知らせる通知を、開けた後も残さないため）。
  // そのため手前で出すと、`settings.json` が壊れていることが本文と一緒に消えてしまう。
  //
  // 本文の描画とは独立した情報であるため、1 フレーム遅れて表示して差し支えない。
  reportStartupProblems(bootstrap);

  // 04.tech-stack/09-tauri-config.md §1: 最初に表示されるフレームが既に本文である状態を作る。
  if (isTracing()) await platform.reportTrace(drain());
  await platform.ready();

  // 以降はウィンドウの表示後に実行する。
  // いずれも Rust 側への購読（IPC）を伴い、本文が読める時点に間に合っている必要がない。
  //
  // ファイル監視の購読が遅れた場合の最悪の結果は、起動直後の数十 ms に発生した外部変更を検出できないことであり、`F5` で回復できる
  // （02.architecture/05-startup-sequence.md §1 の判断基準）。
  //
  // 最大化状態の追従も同じ扱いである。
  // 遅れた場合の最悪の結果は、最大化して起動した直後の数十 ms だけボタンの表示が `□` のままになることで、次に状態が変われば解消する。
  // 2 枚目以降のタブ（起動時の引数 / 前回のセッション）。
  //
  // `ready()` の後に置く。本文が読める時点（T8）を、ファイル 20 枚の読み込みの後ろへ動かさない。
  // 遅れた場合の最悪の結果は、起動直後の一瞬だけタブが 1 枚に見えることである
  // （02.architecture/05-startup-sequence.md §1 の判断基準）。
  void openRemainingTabs(bootstrap);

  installOpenRequestHandler();
  installTrayOpen();
  installSaveAndQuit();
  installTrayResume();
  installDragAndDrop();
  installFileWatch();
  installSettingsWatch();
  installWindowState();
  // `preview.softBreak` の変更に追従して本文を描き直す（#45）。CSS だけでは反映できない唯一のプレビュー設定である。
  installSoftBreakRerender();
  // タブの変化を `state.json` へ書き続ける（OQ-04）。
  // 復元より後に張る。復元そのものを 1 枚ずつ書き戻すことに意味がない。
  watchSession();

  // Snap Layouts の初回報告（OQ-30）。ここより前に置いてはいけない。
  //
  // 矩形を測る `getBoundingClientRect()` は強制同期レイアウトであり、シェルを描画した直後に呼ぶとスタイル再計算とレイアウトが実行される（実測 32〜35ms）。
  // その間はパース側のスクリプト評価も進まないため、シェルとパースを重ねるというこの経路の前提が成立しなくなる（`window.ts` の `trackSnapLayoutsTarget`）。
  //
  // 遅れた場合の最悪の結果は、起動直後の数十 ms だけフライアウトが表示されないことである。
  // Windows へ応答する主体は `ready()` の中で登録されるため、ここでも取りこぼさない。
  reportSnapLayoutsTarget();

  // エディター（F-EDIT-01）。`ready()` の後に実行する。
  //
  // `--mode edit` で起動した場合でも、本文が読める時点（T8）をチャンクの取得と評価の後ろへ動かさない。
  // 遅れた場合の最悪の結果は、起動直後の一瞬だけ空のエディター面が表示されることであり、これは解消する
  // （02.architecture/05-startup-sequence.md §1 の判断基準）。
  installInitialEditor();

  // カスタム CSS の残り（遅延取得・監視・通知）は遅延チャンクに置いてある（06.roadmap/m1.5-shell-and-settings.md §3）。
  // `main` に残っているのは適用そのものだけである。
  // ここで待たないのは、いずれも本文の表示に関与しないためである。
  void import('@/features/settings/lazy/install-custom-css').then(({ installCustomCss }) => {
    installCustomCss('preview', customCss, customCssResult);
    installCustomCss('editor', editorCss, editorCssResult);
    return null;
  });

  // 入力レスポンスの計測（`--bench-input` / 計測専用 / `features/bench/input.ts`）。
  //
  // `ready()` の後に実行する。エディターの読み込みを待つ側であり、起動の経路には関与しない。
  // フラグが指定された起動でしかチャンクを取得しないため、通常の起動には影響しない。
  if (bootstrap?.benchInput === true) {
    void import('@/features/bench/input').then(async ({ runInputBench }) => {
      await runInputBench();
      return null;
    });
  }
}

/**
 * 1 枚目より後のタブを開く。
 *
 * 経路は 2 つあり、同時には起きない（Rust 側で `session` が入るのは引数が無いときだけである）。
 *
 * - `pendingPaths`: `marxdown a.md b.md` の 2 枚目以降
 * - `session`: 前回のタブ（[OQ-04](../../docs/07.open-questions/decided.md) の推奨 C）
 */
async function openRemainingTabs(bootstrap: Bootstrap | null): Promise<void> {
  if (!bootstrap) return;

  if (bootstrap.session.length > 1) {
    await restoreSession(bootstrap.session, bootstrap.sessionActive);
    return;
  }
  if (bootstrap.pendingPaths.length > 0) await openPathsInTabs(bootstrap.pendingPaths);
}

/**
 * エディターを用意する。
 * 起動時のモードによって、載せるか温めるかが変わる。
 * `--mode edit` で起動した場合は画面がエディターを待っているのでその場で載せ、それ以外（既定の Preview）はアイドル時にチャンクだけを取得しておく。
 *
 * 後者が `editor` チャンクのアイドルプリロードである。
 * マウントはしないため、`#mx-editor` は空のまま非表示になっている。
 * 初めて `Ctrl+Shift+V` を押したときの待ち時間が無くなるだけで、押さなければ何も起きない。
 *
 * `requestIdle` は 1 回きりで、ポーリングではない（`lib/idle.ts`）。
 */
function installInitialEditor(): void {
  if (viewStore.mode !== 'preview') {
    // `--mode split` で起動した場合はスクロール同期も開始する。
    // `setMode` を通らない経路であるため、ここで処理しないと Split で開いたときだけ同期が働かない。
    const split = viewStore.mode === 'split';
    void mountEditorLazily().then(() => (split ? setSplitSyncLazily(true) : undefined));
    return;
  }
  requestIdle(() => void preloadEditor());
}

/**
 * 本文中のリンククリック（F-VIEW-05, 06, 07 / N-SEC-04）。
 *
 * 登録は 1 回だけ行う。
 * `#mx-preview` は index.html に最初から存在し、開き直しても同じ要素のままで、ハンドラは現在のドキュメントをストアから読む。
 * 開くたびに登録するとリスナーが蓄積する。
 */
function installLinks(): void {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!container) return;

  // 開く処理も通知も `document` が担当し、`document` は本文を描画するために `preview` を参照している。
  // 逆向きの呼び出しはここで接続する（`configureHistory` と同じ形）。
  installLinkHandler(container, {
    currentPath: () => documentStore.meta?.path ?? '',
    open: (path, anchor) => void openPath(path, anchor === undefined ? {} : { anchor }),
    notify: (notice) => {
      documentStore.notice = notice;
    },
  });
}

/**
 * 起動時に開くべき本文を確定させる。
 *
 * 通常は bootstrap に本文ごと載っている。
 * 載っていないのは 256KB を超えるファイルのときだけで、この場合だけ IPC 往復が 1 回増える
 * （初期化スクリプトに埋め込むと、文字列化のコストが往復のコストを上回る）。
 */
async function resolveInitialDocument(bootstrap: Bootstrap | null): Promise<DocumentPayload | null> {
  const doc = bootstrap?.document ?? null;

  if (doc?.content !== null && doc?.content !== undefined) {
    return { ...doc, content: doc.content };
  }

  if (doc) {
    try {
      return await getPlatform().readDocument(doc.path);
    } catch (e) {
      documentStore.notice = { level: 'error', message: toMessage(e) };
      return null;
    }
  }

  return null;
}

/**
 * 起動時に見つかった問題（CLI 引数 / 設定）を通知バーに出す。
 *
 * 本文の描画とは独立しているが、描画の後に呼ぶ（理由は呼び出し側に記載）。
 */
function reportStartupProblems(bootstrap: Bootstrap | null): void {
  // 通知は 1 つしか表示されず、後から出したものが前のものを上書きするため、重要度の低いものから順に出す。
  // 設定が壊れていても既定値で動作するが、本文が開けなかった場合はユーザーの操作そのものが失敗しているため、そちらを表示する。
  reportSettingsProblem(bootstrap?.settingsError ?? null);

  if (bootstrap?.documentError) {
    const e = bootstrap.documentError;
    documentStore.notice = { level: 'error', message: describeError(e.kind, e.path, e.message) };
  }
  if (bootstrap && bootstrap.unknownArgs.length > 0) {
    documentStore.notice = {
      level: 'warning',
      message: ja.error.unknownArgs(bootstrap.unknownArgs),
    };
  }
}

/**
 * トレイメニューの「Marxdown を開く」（ADR-0007 論点 6）。
 *
 * ダイアログを Rust 側では表示しない。
 * `pick_file` は既にあるが、開いた結果の扱い（履歴に積む / 通知を出す / 相対パスの基準を差し替える）は `open.ts` に集約してある。
 * トレイから別経路で開くと、そこだけ処理が抜ける。
 *
 * 「最近開いたファイル」は argv 転送（`onOpenRequest`）に載せてあるため、ここは通らない。
 */
function installTrayOpen(): void {
  getPlatform().onTrayOpen(() => {
    runCommand('document.open');
  });
}

/**
 * 終了の確認で「保存して終了」が選ばれたとき（F-EDIT-03 / `src-tauri/src/close.rs`）。
 *
 * 保存できるのはフロントだけである。
 * 本文は Monaco の `ITextModel` にあり（ADR-0005）、Rust からは読めない。
 * Rust は保存を依頼するだけで、成功したらフロントがもう一度終了を要求する。
 *
 * 失敗した場合はダーティのままなので終了しない。
 * もう一度 `Ctrl+Q` を押せば同じ確認が表示される（N-REL-01）。
 */
function installSaveAndQuit(): void {
  getPlatform().onSaveAndQuit(() => {
    void saveThenQuit();
  });
}

/**
 * トレイからの復帰を計測する（ADR-0007「計測項目」/ 目標 120ms）。
 *
 * Warm Start（20.0ms）とは別の経路である。
 * Warm Start はウィンドウが可視のまま argv 転送を受けた場合の値で、こちらはサスペンドされた WebView が復帰して表示されるまでを測る。
 * 06.roadmap/m1.5-shell-and-settings.md §3 の完了条件はこちらの経路を対象とする。
 *
 * 本文は既に描画されている（ウィンドウを破棄していないため再描画が不要）。
 * そのため読める状態の判定は 1 フレーム描画されたことで足り、開き直す経路と違ってパースも paint も挟まらない。
 */
function installTrayResume(): void {
  const platform = getPlatform();

  platform.onTrayResume((requestId) => {
    const seen = performance.now();
    requestAnimationFrame(() => {
      const fromEvent = performance.now() - seen;
      void platform.warmDone(requestId, '', `fromEvent=${fromEvent.toFixed(1)}ms`, 'tray-resume');
    });
  });
}

/**
 * 別インスタンスからの起動要求（ウォーム起動 / ADR-0004）。
 *
 * この経路には WebView の初期化もバンドルの評価も Svelte のマウントも含まれず、必要なのはパースの実行だけである（02.architecture/05-startup-sequence.md §2）。
 *
 * **転送されたファイルはタブとして増やす**（M3 Phase 2）。
 * 既に開いているファイルなら、そのタブへ切り替えるだけで開き直さない（`openPathInNewTab`）。
 *
 * 計測はウォーム起動の実測値として Rust へ返す。
 * 複数渡された場合も 1 回だけ返す。測っているのは「転送を受けてから読めるようになるまで」であり、
 * 転送 1 回に対して 1 つの値である。
 */
function installOpenRequestHandler(): void {
  const platform = getPlatform();

  platform.onOpenRequest((req) => {
    const path = req.paths[0];
    if (path === undefined) return;

    const warmStart = performance.now();
    void openPathsInTabs(req.paths).then(async (opened) => {
      if (!opened) return opened;

      // Rust 側は argv 転送を受けた時点から、こちらはイベント受信から測っている。
      // 両方を記録して差分も確認できるようにする。
      const fromEvent = performance.now() - warmStart;
      await platform.warmDone(req.requestId, path, `fromEvent=${fromEvent.toFixed(1)}ms paths=${req.paths.length}`);
      return opened;
    });
  });
}

/**
 * ウィンドウへのドラッグ＆ドロップ（F-OPEN-08）。
 *
 * ドロップ先の表示は `data-mx-dragover` 属性 1 つで表す。
 * Svelte を通さないのは、ドラッグ中に `over` が毎フレーム発火するためである（ADR-0005 と同じ判断）。
 */
function installDragAndDrop(): void {
  const root = document.documentElement;

  getPlatform().onDragDrop((event) => {
    if (event.type === 'over') {
      root.dataset['mxDragover'] = 'true';
      return;
    }

    delete root.dataset['mxDragover'];
    if (event.type !== 'drop') return;

    // 落とされた数だけタブを開く（F-OPEN-08 / M3 Phase 2）。
    void openPathsInTabs(event.paths);
  });
}

function describeError(kind: string, path: string, fallback: string): string {
  const table = ja.error as Record<string, unknown>;
  const entry = table[kind];
  if (typeof entry === 'function') return (entry as (p: string) => string)(path);
  if (typeof entry === 'string') return entry;
  return fallback;
}
