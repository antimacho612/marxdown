/**
 * E2E の設定（02.architecture/12-testing-strategy.md / OQ-29）。
 *
 * M2 で編集と保存が入ると、壊れたときの被害が「表示が崩れる」から「ユーザーのファイルが壊れる」に変わる（N-REL-01）。
 * 原子的書き込み・衝突検知・EOL/BOM の復元は、単体テストでは通しで検証できない。
 * Rust 側の `document::write` は `cargo test` が固めてあるので（`read_then_save_untouched_keeps_bytes_identical`）、ここが見るのはその上、「エディターの内容 → `WriteRequest` の組み立て → IPC → ディスクのバイト列」の経路である。
 *
 * CI では走らせない。
 * 05.performance-budget/05-operations.md §5 と同じ扱いで、実機（WebView2 ランタイム + 版の合った msedgedriver）が要り、環境ノイズも大きい。
 * `pnpm e2e` の手動実行と、マイルストーン完了時の実行にとどめる。
 * 前提の揃え方は `e2e/README.md`。
 *
 * 本数は絞る。
 * 02.architecture/12-testing-strategy.md の方針どおり E2E は遅くて壊れやすいため、ここに置いてよいのは保存経路と起動して本文が出ることだけで、それ以外は Vitest と `cargo test` の担当。
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP } from './helpers/app';
import { resetWorkspace } from './helpers/fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * WebView2 を操作するネイティブドライバ。
 *
 * **WebView2 ランタイムと版を揃える必要がある**（`e2e/README.md`）。
 * リポジトリには入れない（11MB / 環境ごとに版が違う）。
 */
const NATIVE_DRIVER = path.join(here, '.drivers', 'msedgedriver.exe');

const TAURI_DRIVER_PORT = 4444;

let driver: ChildProcess | null = null;

/**
 * 既に Marxdown が起動していないか。
 *
 * **この確認が要るのは、Marxdown が単一インスタンスだからである**（ADR-0004）。
 * 起動済みのプロセスがあると、ドライバが立てた 2 つ目は argv を転送して
 * **即座に終了する**。WebDriver から見るとセッションが張れずに落ちるだけで、
 * 原因が「前回の E2E がトレイに residual を残した」ことだとは読めない
 * （ADR-0007: `✕` はプロセスを終わらせない）。
 */
function assertNoRunningInstance(): void {
  let out: string;
  try {
    out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq marxdown.exe', '/NH'], { encoding: 'utf8' });
  } catch {
    return; // tasklist が無い環境では諦める（Windows 以外）
  }
  if (!out.toLowerCase().includes('marxdown.exe')) return;

  throw new Error(
    'Marxdown が既に起動している。単一インスタンス（ADR-0004）なので、' +
      'この状態では E2E のセッションが張れない。' +
      'トレイから終了するか `taskkill /IM marxdown.exe /F` してから再実行すること。',
  );
}

/**
 * 残っている Marxdown を落とす。**居なくても失敗にしない。**
 *
 * ここで落とすのが E2E のものだけであることは、走り始めの
 * `assertNoRunningInstance()` が担保している。
 */
function killLeftoverInstances(): void {
  try {
    execFileSync('taskkill', ['/IM', 'marxdown.exe', '/F'], { stdio: 'ignore' });
  } catch {
    // 居なければ taskkill は失敗する。それが正常
  }
}

function assertPrerequisites(): void {
  if (!existsSync(APP)) {
    throw new Error(`実行ファイルが無い: ${APP}\n先に \`pnpm build:app\` を実行すること。`);
  }
  if (!existsSync(NATIVE_DRIVER)) {
    throw new Error(`msedgedriver が無い: ${NATIVE_DRIVER}\n揃え方は e2e/README.md を読むこと。`);
  }
  assertNoRunningInstance();
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [path.join(here, 'specs', '**', '*.e2e.ts')],

  /**
   * **1 セッションずつ。** Marxdown は単一インスタンスなので、
   * 2 つ並べた時点で片方が argv を転送して消える。
   */
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'wry',
      /*
       * **引数を渡さない。**
       *
       * `args` は `ms:edgeOptions.args` へ流れて Chromium のスイッチとして
       * 解釈されるため、ファイルパスを載せられない（`helpers/app.ts` に実測）。
       * 開くのは argv 転送で行う（ADR-0004 / `forwardOpen`）。
       */
      'tauri:options': { application: APP },
    } as WebdriverIO.Capabilities,
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    // 起動 + WebView2 の初期化 + パースで、コールドだと 1 秒近くかかる（464ms 実測）。
    // ドライバの往復を含めて余裕を見る。
    timeout: 60_000,
  },

  logLevel: 'warn',
  // tauri-driver が中継役。ここが WebDriver のエンドポイントになる。
  hostname: '127.0.0.1',
  port: TAURI_DRIVER_PORT,

  onPrepare() {
    assertPrerequisites();

    driver = spawn('tauri-driver', ['--port', String(TAURI_DRIVER_PORT), '--native-driver', NATIVE_DRIVER], {
      stdio: [null, process.stdout, process.stderr],
      shell: true,
    });
  },

  /**
   * **spec ファイルごとに作業ファイルを作り直す。**
   *
   * spec ファイル 1 つにつきセッションが 1 つ張られ、そのたびにアプリが起動する。
   * `onPrepare` で 1 回だけ用意すると、保存を試す spec が書き換えたファイルを
   * 次の spec が引き継ぐ。「保存していないのに内容が違う」テストが生まれる。
   *
   * 対象ファイルは**セッションを張る前**に無ければならない。argv 転送で開く以上、
   * ここより後に作っても間に合わない。
   */
  beforeSession() {
    resetWorkspace();
  },

  /**
   * **残ったプロセスを片付ける。**
   *
   * Marxdown は `✕` でプロセスが終わらない（ADR-0007）。セッションが終わっても
   * トレイに残ることがあり、残ったまま次のセッションが始まると、ドライバが立てた
   * 2 つ目は argv を転送して即座に終了する（単一インスタンス / ADR-0004）。
   * **次の spec が丸ごと開けなくなる。**
   */
  afterSession() {
    killLeftoverInstances();
  },

  onComplete() {
    killLeftoverInstances();
    driver?.kill();
    driver = null;
  },
};
