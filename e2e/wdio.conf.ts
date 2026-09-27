/**
 * E2E の設定。
 *
 * 編集と保存があるため、壊れたときの被害は「表示が崩れる」では済まず「ユーザーのファイルが壊れる」になる（N-REL-01）。
 * 原子的書き込み・衝突検知・EOL/BOM の復元は、単体テストでは通しで検証できない。
 * Rust 側の `document::write` は `cargo test` が検証しているため（`read_then_save_untouched_keeps_bytes_identical`）、ここで検証するのはその上、「エディターの内容 → `WriteRequest` の組み立て → IPC → ディスクのバイト列」の経路である。
 *
 * CI では走らせない。
 * 起動時間やメモリの計測と同じ扱いで、実機（WebView2 ランタイム + 版の合った msedgedriver）が要り、環境ノイズも大きい。
 * `pnpm e2e` の手動実行と、マイルストーン完了時の実行にとどめる。
 * 前提の揃え方は `e2e/README.md`。
 *
 * 本数は絞る。
 * E2E は遅くて壊れやすいため、ここに置くのは実機のプロセス・キー配送・IPC を通さないと確かめられないものだけで、それ以外は Vitest と `cargo test` で検証する。
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP } from './helpers/app';
import { resetWorkspace } from './helpers/fixtures';
import { seedRestoredSession } from './helpers/session';
import { clearSession } from './helpers/store';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * WebView2 を操作するネイティブドライバ。
 *
 * WebView2 ランタイムと版を揃える必要がある（`e2e/README.md`）。
 * リポジトリには入れない（11MB / 環境ごとに版が違う）。
 */
const NATIVE_DRIVER = path.join(here, '.drivers', 'msedgedriver.exe');

const TAURI_DRIVER_PORT = 4444;

let driver: ChildProcess | null = null;

/**
 * 既に Marxdown が起動していないか。
 *
 * この確認が要るのは、Marxdown が単一インスタンスだからである（ADR-0004）。
 * 起動済みのプロセスがあると、ドライバが起動した 2 つ目は argv を転送して即座に終了する。
 * WebDriver からはセッションを張れずに失敗するように見え、原因が「前回の E2E のプロセスがトレイに残っている」ことだとは分からない（ADR-0007: `✕` はプロセスを終わらせない）。
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
 * 残っている Marxdown を終了させる。無くても失敗にしない。
 *
 * ここで終了させるのが E2E のものだけであることは、実行開始時の `assertNoRunningInstance()` が担保している。
 */
function killLeftoverInstances(): void {
  try {
    execFileSync('taskkill', ['/IM', 'marxdown.exe', '/F'], { stdio: 'ignore' });
  } catch {
    // プロセスが無ければ taskkill は失敗する。それが正常
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
   * メモリ計測は `pnpm e2e:memory`（`wdio.memory.conf.ts`）の担当。
   *
   * 1 本で数分かかるうえ、WebView2 に計測用のスイッチを渡した状態のアプリを要求する（`helpers/memory.ts`）。
   */
  exclude: [path.join(here, 'specs', 'memory.e2e.ts'), path.join(here, 'specs', 'memory-tabs.e2e.ts')],

  /**
   * 1 セッションずつ。
   * Marxdown は単一インスタンスなので、2 つ並べた時点で片方が argv を転送して消える。
   */
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'wry',
      /*
       * 引数を渡さない。
       *
       * `args` は `ms:edgeOptions.args` へ流れて Chromium のスイッチとして解釈されるため、ファイルパスを渡せない（`helpers/app.ts`）。
       * 開くのは argv 転送で行う（ADR-0004 / `forwardOpen`）。
       */
      'tauri:options': { application: APP },
    } as WebdriverIO.Capabilities,
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    // 起動 + WebView2 の初期化 + パースで、コールドでは数百 ms かかる。
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
   * spec ファイルごとに作業ファイルを作り直す。
   *
   * spec ファイル 1 つにつきセッションが 1 つ張られ、そのたびにアプリが起動する。
   * `onPrepare` で 1 回だけ用意すると、保存を試す spec が書き換えたファイルを次の spec が引き継ぐ。「保存していないのに内容が違う」テストが生まれる。
   *
   * 対象ファイルはセッションを張る前に無ければならない。argv 転送で開く以上、ここより後に作っても間に合わない。
   */
  beforeSession(_config: unknown, _capabilities: unknown, specs: string[]) {
    resetWorkspace();

    // セッション復元は起動時にしか行われない。
    // アプリが立ち上がる前のここでしか仕込めず、他の spec のためにここで消す必要もある（E2E のアプリは引数なしで立ち上がるため、記録が残っていると全部の spec が復元から始まる）。
    if (specs.some((spec) => spec.endsWith('session.e2e.ts'))) {
      seedRestoredSession();
    } else {
      clearSession();
    }
  },

  /**
   * 残ったプロセスを片付ける。
   *
   * Marxdown は `✕` でプロセスが終わらない（ADR-0007）。セッションが終わってもトレイに残ることがあり、残ったまま次のセッションが始まると、ドライバが立てた 2 つ目は argv を転送して即座に終了する（単一インスタンス / ADR-0004）。
   * 次の spec が丸ごと開けなくなる。
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
