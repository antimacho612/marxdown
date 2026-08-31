/**
 * 起動シーケンス（02.architecture/05-startup-sequence.md §1）。
 *
 * Marxdown で最も重要な経路。ここを 1 本の細い線に保つことが
 * Principle 1「Open Fast」の実装そのもの。
 *
 * ```text
 * T4  初期スクリプト評価開始          （Rust の initialization_script が打つ）
 * T5  bootstrap を同期読み取り        （IPC 往復なし）
 * T6  Worker へ parse を送信          （シェル描画より先に投げる）
 * ─── ここでシェルを描く。Worker は並行に働いている ───
 * T7  Worker から HTML 受信
 * T8  本文 DOM 挿入完了 + 次の rAF     ← 「読める」瞬間
 * T9  window.show()
 * ```
 *
 * # 順序の理由
 *
 * `parse` の送信を**シェル描画より前**に置いているのが要点。
 * Worker への postMessage はほぼ即座に返るので、送信を先に済ませておけば
 * シェルの描画時間がまるごとパース時間に重なる。
 *
 * この重ね合わせは `openDocument` の `betweenParseAndPaint` として表現してある。
 * 開く経路そのものは `features/document/open.ts` に 1 本化されており、
 * このファイルに残るのは**起動に固有の仕事**（bootstrap の読み取り、
 * ウィンドウの表示、購読の登録）だけ。
 */
import { configureOpener, openDocument, openDropped, openPath } from '@/features/document/open';
import { saveThenQuit } from '@/features/document/save';
import { documentStore } from '@/features/document/store.svelte';
import { installFileWatch } from '@/features/document/watch';
import { mountEditorLazily, preloadEditor, setSplitSyncLazily } from '@/features/editor/open-editor';
import { initPanes } from '@/features/panes/panes';
import { installLinkHandler } from '@/features/preview/links';
import { applyZoom } from '@/features/preview/zoom';
import { applyCustomCss } from '@/features/settings/custom-css';
import { initSettings, installSettingsWatch, reportSettingsProblem } from '@/features/settings/store.svelte';
import { decideInitialMode, initMode } from '@/features/view/mode';
import { initSplit } from '@/features/view/split';
import { viewStore } from '@/features/view/store.svelte';
import { recentStore } from '@/features/workspace/recent.svelte';
import { ja } from '@/i18n/ja';
import { runCommand } from '@/lib/commands';
import { toMessage } from '@/lib/error';
import { requestIdle } from '@/lib/idle';
import { adoptT4, drain, initTrace, isTracing, mark } from '@/lib/trace';
import { createParser } from '@/markdown/worker/client';
import { getPlatform, type Bootstrap, type DocumentPayload, type SpikeFlags } from '@/platform';

import { installCommands } from './commands';
import { installWindowState, reportSnapLayoutsTarget } from './window';

const PREVIEW_SELECTOR = '#mx-preview';

/** bootstrap が取れない場合の保険（`dev:web` の初回など）。 */
const FALLBACK_SPIKE: SpikeFlags = { parse: 'worker' };

/**
 * bootstrap を読む。**同期的に読めることが最重要**（02.architecture/05-startup-sequence.md §1 の要点 2）。
 *
 * `invoke()` の往復を待つと、WebView 準備完了 → リクエスト → レスポンスという
 * 最低 1 ラウンドトリップが本文表示前に挟まる。
 */
export function readBootstrap(): Bootstrap | null {
  return getPlatform().getBootstrap();
}

export async function startup(renderShell: () => void): Promise<void> {
  const platform = getPlatform();

  const bootstrap = readBootstrap();
  initTrace(bootstrap?.trace ?? null);
  adoptT4();
  mark('T5', bootstrap?.document ? `${bootstrap.document.size} bytes` : 'no document');

  const spike = bootstrap?.spike ?? FALLBACK_SPIKE;

  // 倍率は**本文を描くより前**に当てる（F-VIEW-11）。
  // 後から当てると、既定倍率で 1 フレーム描かれてから跳ねる。
  applyZoom(bootstrap?.zoom ?? 1, false);
  recentStore.entries = bootstrap?.recent ?? [];

  // ペインの開閉と幅も**本文を描くより前**（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
  // 後から当てると、本文が一度全幅で描かれてから横に詰まる。倍率と同じ理由で
  // bootstrap に載せてある（02.architecture/04-rust-responsibilities.md §5）。
  //
  // ここで入れた値は、この下の `renderShell()` が描く最初のシェルに既に効いている。
  // シェルの描画は本文の paint より前（`betweenParseAndPaint`）なので、
  // **全幅の本文が 1 フレームでも画面に出ることは無い。**
  initPanes(bootstrap);
  // Split の分割比も同じ理由でここ（03.ux-spec/03-split-mode.md §1）。
  // 後から当てると、`--mode split` で開いたときに 50:50 で一度描かれてから寄る。
  initSplit(bootstrap);

  // 設定も同じ理由でここ。bootstrap に丸ごと載っているので IPC 往復は無い
  // （02.architecture/04-rust-responsibilities.md §5 / 02.architecture/05-startup-sequence.md §1）。テーマ・フォント・本文幅は
  // `initSettings` の中で**同期的に** CSS 変数へ当たる。後から当てると、
  // 一度出た絵が描き変わる（02.architecture/05-startup-sequence.md §1 の表）。
  initSettings(bootstrap);

  // カスタム CSS も**本文を描くより前**（F-CONF-07 / 02.architecture/10-theming.md §3）。
  //
  // 64KB 以下なら bootstrap に同梱されて届いている。ここで当てないと、
  // ダークな背景を指定している人の画面で**白い初期画面が一瞬見える**。
  // 当てるのは `@scope (#mx-preview)` で包んだ後の 1 枚だけで、
  // 包めなかった場合は当てずに結果だけ返る（通知は `ready()` の後）。
  const customCss = bootstrap?.customCss ?? null;
  const customCssResult = applyCustomCss(customCss?.css ?? null);

  configureOpener({ parser: createParser(spike.parse), site: spike.parse });

  // リンクハンドラとキーバインドは**本文を描くより前**に登録する。
  //
  // リンクを後回しにすると、パースが失敗した / 描画が止まった状態でリンクを
  // 押されたときに素の遷移が起きる。WebView がページ遷移するとアプリのシェルごと
  // 差し替わり、戻る手段が無い（N-SEC-04）。**塞ぐ側を先に置く。**
  //
  // キーバインドを後回しにすると、`extreme.md` のような重いファイルを描いている間
  // `Ctrl+O` が効かない。「別のファイルを開いて逃げる」ができないのは体験として悪い。
  //
  // どちらもリスナーの登録だけで IPC を伴わない。クリティカルパスへの上乗せは
  // 無視できる（IPC を伴う購読は下の `ready()` の後に置いてある）。
  //
  // コマンドの登録もここ。**メニューより先**に済んでいる必要がある
  // （`features/menu` は id しか知らず、実体はこの登録を見に行く / `commands.ts`）。
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

  // 表示モードも**本文を描くより前**に当てる（F-MODE-07 / 倍率・ペインと同じ理由）。
  // 後から当てると、Preview の面が 1 フレーム描かれてからエディタに差し替わる。
  //
  // `--mode edit` で起動しても、ここではまだ `editor` チャンクを取りに行かない。
  // 属性を立てるだけなので、クリティカルパスは太らない。実体は下の
  // `installInitialEditor()` が `ready()` の後で載せる。
  initMode(decideInitialMode(bootstrap, initial));

  if (initial) {
    await openDocument(initial, { trace: true, betweenParseAndPaint: renderShellOnce });
  } else {
    renderShellOnce();
  }

  // 通知は**本文を描いた後**に出す。`openDocument` は描画に成功した時点で
  // 通知バーを下げる（開けなかったことを知らせる通知を、開けたあとも
  // 残さないため）ので、手前で出すと `settings.json` が壊れていることが
  // 本文と一緒に消えてしまう。
  //
  // 本文の描画とは独立な情報なので、1 フレーム遅れて出て構わない。
  reportStartupProblems(bootstrap);

  // --- ウィンドウを見せる -------------------------------------------------
  // 04.tech-stack/09-tauri-config.md §1: 最初に見えるフレームが既に本文である状態を作る。
  if (isTracing()) await platform.reportTrace(drain());
  await platform.ready();

  // --- 以降は非同期 -------------------------------------------------------
  // ウィンドウが見えた後に回す。いずれも Rust 側への購読（IPC）を伴い、
  // 「本文が読める」瞬間に間に合っている必要がない。
  //
  // ファイル監視の購読が遅れたときの最悪は「起動直後の数十 ms に起きた外部変更を
  // 取りこぼす」ことで、`F5` で回復できる（02.architecture/05-startup-sequence.md §1 の判断基準）。
  //
  // 最大化状態の追従も同じ扱い。遅れたときの最悪は「最大化して起動した直後の
  // 数十 ms だけ、ボタンの絵柄が `□` のまま」で、次に状態が変われば必ず直る。
  installOpenRequestHandler();
  installTrayOpen();
  installSaveAndQuit();
  installTrayResume();
  installDragAndDrop();
  installFileWatch();
  installSettingsWatch();
  installWindowState();

  // Snap Layouts の初回報告（OQ-30）。**ここより前に置いてはいけない。**
  //
  // 矩形を測る `getBoundingClientRect()` は強制同期レイアウトで、シェルを描いた
  // 直後に呼ぶとスタイル再計算とレイアウトがまるごと走る（実測 32〜35ms）。
  // その間はパース側のスクリプト評価も進まないので、シェルとパースを重ねるという
  // この経路の前提そのものが崩れる（`window.ts` の `trackSnapLayoutsTarget`）。
  //
  // 遅れたときの最悪は「起動直後の数十 ms だけフライアウトが出ない」。
  // Windows へ答える主体は `ready()` の中で付くので、ここでも取りこぼさない。
  reportSnapLayoutsTarget();

  // エディタ（F-EDIT-01）。**`ready()` の後**に回す。
  //
  // `--mode edit` で起動した場合でも、本文が読める瞬間（T8）を 203KB の
  // チャンク取得と評価の後ろへ動かさない。遅れたときの最悪は「起動直後の
  // 一瞬だけ空のエディタ面が見える」ことで、これは回復する
  // （02.architecture/05-startup-sequence.md §1 の判断基準）。
  installInitialEditor();

  // カスタム CSS の残り（遅延取得・監視・通知）は**遅延チャンク**に置いてある
  // （06.roadmap/m1.5-shell-and-settings.md §3）。`main` に残っているのは適用そのものだけ。
  // ここで待たないのは、いずれも本文の表示に関与しないため。
  void import('@/features/settings/custom-css-late').then(({ installCustomCss }) => {
    installCustomCss(customCss, customCssResult);
    return null;
  });
}

/**
 * エディタを用意する。**起動時のモードによって、載せるか温めるかが変わる。**
 *
 * ```text
 * --mode edit で起動した  → その場で載せる（画面がエディタを待っている）
 * それ以外（既定の Preview） → アイドルでチャンクだけ取っておく
 * ```
 *
 * 後者が `editor` チャンクの idle プリロード。**載せはしない**ので、
 * `#mx-editor` は空のまま隠れている。初めて `Ctrl+Shift+V` を押したときの
 * 待ちが消えるだけで、押さなければ何も起きない。
 *
 * `requestIdle` は 1 回きりで、ポーリングではない（`lib/idle.ts`）。
 */
function installInitialEditor(): void {
  if (viewStore.mode !== 'preview') {
    // `--mode split` で起動した場合は同期も始める。`setMode` を通らない経路なので、
    // ここで面倒を見ないと「Split で開いたときだけ追随しない」ことになる。
    const split = viewStore.mode === 'split';
    void mountEditorLazily().then(() => (split ? setSplitSyncLazily(true) : undefined));
    return;
  }
  requestIdle(() => void preloadEditor());
}

/**
 * 本文中のリンククリック（F-VIEW-05, 06, 07 / N-SEC-04）。
 *
 * **1 回だけ**登録する。`#mx-preview` は index.html に最初から在り、開き直しても
 * 同じ要素のままで、ハンドラは現在のドキュメントをストアから読む。
 * 開くたびに登録するとリスナーが積み上がる。
 */
function installLinks(): void {
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (container) installLinkHandler(container);
}

/**
 * 起動時に開くべき本文を確定させる。
 *
 * 通常は bootstrap に本文ごと載っている。載っていないのは
 * **256KB 超のファイル**のときだけで、この場合だけ IPC 往復が 1 回増える
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
 * 本文の描画とは独立だが、**描画の後**に呼ぶ（呼び出し側にその理由がある）。
 */
function reportStartupProblems(bootstrap: Bootstrap | null): void {
  // 通知は 1 つしか出ない（後から出したものが勝つ）ので、**弱いものから順に**出す。
  // 設定が壊れていても既定値で読めているが、本文が開けなかったのは
  // ユーザーがやろうとしたこと自体の失敗であり、そちらを見せる。
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
 * 別インスタンスからの起動要求（ウォーム起動）。
 *
 * ここには WebView の初期化も、バンドルの評価も、Svelte のマウントも存在しない。
 * **Worker が既に温まっており、パースだけが仕事になる**（02.architecture/05-startup-sequence.md §2）。
 *
 * タブが実装される（M3）までは「タブを増やす」のではなく現在の本文を置き換える。
 */
/**
 * トレイメニューの「Marxdown を開く」（ADR-0007 論点 6）。
 *
 * **ダイアログを Rust 側で出さない。** `pick_file` は既にあるが、開いた結果の扱い
 * （履歴に積む / 通知を出す / 相対パスの基準を差し替える）は `open.ts` に
 * 集約してある。トレイから別経路で開くと、そこだけ抜け落ちる。
 *
 * 「最近開いたファイル」のほうは argv 転送（`onOpenRequest`）に載せてあるので、
 * ここには来ない。
 */
function installTrayOpen(): void {
  getPlatform().onTrayOpen(() => {
    runCommand('document.open');
  });
}

/**
 * 終了の確認で「保存して終了」が選ばれたとき（F-EDIT-03 / `src-tauri/src/close.rs`）。
 *
 * **保存できるのはフロントだけである。** 本文は CodeMirror の `EditorState` にあり
 * （ADR-0005）、Rust からは読めない。Rust は頼むだけで、
 * 成功したらこちらがもう一度終了を要求する。
 *
 * 失敗したらダーティのままなので終了しない。もう一度 `Ctrl+Q` を押せば
 * 同じ確認が出る（N-REL-01）。
 */
function installSaveAndQuit(): void {
  getPlatform().onSaveAndQuit(() => {
    void saveThenQuit();
  });
}

/**
 * トレイからの復帰を計測する（ADR-0007「計測項目」/ 目標 120ms）。
 *
 * **Warm Start（20.0ms）とは別の経路である。** あちらはウィンドウが可視のまま
 * argv 転送を受けた値で、こちらはサスペンドされた WebView が起こされて
 * 画面に出るまで。06.roadmap/m1.5-shell-and-settings.md §3 の完了条件は**この経路のほう**を見る。
 *
 * 本文は既に描かれている（ウィンドウを破棄していないので再描画が要らない）ため、
 * 「読める」の判定は **1 フレーム描かれたこと**でよい。開き直す経路と違って
 * パースも paint も挟まらない。
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

function installOpenRequestHandler(): void {
  const platform = getPlatform();

  platform.onOpenRequest((req) => {
    const path = req.paths[0];
    if (path === undefined) return;

    const warmStart = performance.now();
    void openPath(path, { startedAt: warmStart }).then(async (outcome) => {
      if (!outcome) return outcome;

      // ウォーム起動の実測値。
      // Rust 側は argv 転送を受けた瞬間から測っており、こちらはイベント受信から
      // 測っている。両方を記録して差分も見えるようにする。
      const fromEvent = performance.now() - warmStart;
      await platform.warmDone(
        req.requestId,
        path,
        `fromEvent=${fromEvent.toFixed(1)}ms parse=${outcome.parseMs.toFixed(1)}ms chunks=${outcome.chunks}`,
      );
      return outcome;
    });
  });
}

/**
 * ウィンドウへのドラッグ＆ドロップ（F-OPEN-08）。
 *
 * ドロップ先の見た目は `data-mx-dragover` 属性 1 つで表す。Svelte を通さないのは、
 * ドラッグ中は毎フレーム `over` が飛んでくるため（ADR-0005 と同じ判断）。
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

    void openDropped(event.paths);
  });
}

function describeError(kind: string, path: string, fallback: string): string {
  const table = ja.error as Record<string, unknown>;
  const entry = table[kind];
  if (typeof entry === 'function') return (entry as (p: string) => string)(path);
  if (typeof entry === 'string') return entry;
  return fallback;
}
