/**
 * メモリの計測を E2E から駆動する（[OQ-18](../../docs/07.open-questions/oq-18-memory-not-released.md) / M3 Phase 0）。
 *
 * 手で測ると、`huge.md` を「描き切ってから」切り替えたのか「描画の途中で」切り替えたのかが記録に残らない。
 * この 2 つは別の話で、後者に該当する保持経路（`paint()` の打ち切り漏れ）は既に塞いである。
 * 前者を測るには段階的描画の完了を待つ必要があり、待つには機械で駆動するしかない。
 *
 * 値は 3 種類を揃えて取る。
 * プロセスの Private Working Set だけでは、戻らない分が JS 側にあるのか Blink の DOM 側にあるのかを区別できない。
 *
 * | 観測 | 読み方 |
 * | --- | --- |
 * | GC 後にプロセスが戻る | 候補 1（未回収なだけ）で決着 |
 * | JS ヒープは戻るがプロセスが戻らない | JS 側ではない。Blink の DOM かアロケータ側 |
 * | GC 後も JS ヒープが戻らない | 候補 3（切り離された DOM の到達可能性）/ 4（`outline`）へ |
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const SCRIPT = path.resolve(here, '..', '..', 'scripts', 'measure-memory.ps1');

/** tauri-driver の待ち受けポート（`wdio.conf.ts` と同じ値）。 */
const DRIVER_PORT = 4444;

/** 基準ファイルの置き場所（`pnpm fixtures` が作る。Git 管理外）。 */
export const FIXTURES = path.resolve(here, '..', '..', 'bench', 'fixtures');

/** 計測結果の書き出し先。[measurements](../../docs/measurements/README.md) の他の JSON と同じ場所に置く。 */
export const REPORT = path.resolve(here, '..', '..', 'docs', 'measurements', 'memory-oq18.json');

/**
 * WebView2 に渡す追加スイッチ。`wdio.memory.conf.ts` が環境変数 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` として置く。
 *
 * `--enable-precise-memory-info` が要る。
 * 既定の `performance.memory` は 100KB 単位に丸めた値を返し、更新間隔も長い。
 * 開いて閉じる数十秒のあいだ同じ数字が出続けるため、切り分けに使えない。
 *
 * `--js-flags=--expose-gc` は入れない。**渡しても効果が無い**（実測 2026-09-07）。
 * レンダラのコマンドラインには `--js-flags="--expose-gc"` が届いているのに `globalThis.gc` が生えない。
 * 強制 GC は CDP（`forceGc`）で行う。
 */
export const MEMORY_PROBE_BROWSER_ARGUMENTS = '--enable-precise-memory-info';

/** 1 点の計測値。 */
export interface MemorySample {
  label: string;
  at: string;
  /** プロセスツリー全体の Private Working Set 合計。 */
  processMB: number;
  mainMB: number;
  webViewMB: number;
  /** プロセス種別ごとの内訳。増えているのがレンダラなのか GPU なのかはここでしか分からない。 */
  byType: Record<string, number>;
  /** V8 のヒープ使用量。`--enable-precise-memory-info` が無ければ null。 */
  jsHeapMB: number | null;
  /** V8 が確保しているヒープの大きさ。使用量が戻っても、ここが戻るとは限らない。 */
  jsHeapTotalMB: number | null;
  /** 文書に繋がっている要素の数。切り離されたツリーはここに現れない。 */
  domNodes: number | null;
  /** 本文の直下にあるブロックの数。段階的描画が終わったかの判定にも使う。 */
  contentBlocks: number | null;
  /** レンダラが抱えている DOM ノードの総数。**切り離されたツリーもここには残る**（`domCounters`）。 */
  blinkNodes: number | null;
  blinkDocuments: number | null;
  jsEventListeners: number | null;
}

interface ProcessMemory {
  Timestamp: string;
  Label: string;
  ProcessCount: number;
  MainMB: number;
  WebViewMB: number;
  TotalMB: number;
  /** WebView2 のプロセス種別（`--type=`）ごとの内訳。ブラウザプロセスは `browser`。 */
  ByType: Record<string, number>;
}

/**
 * プロセスツリーの Private Working Set。`scripts/measure-memory.ps1` を呼ぶ。
 *
 * 計算を TypeScript 側へ写さない。
 * WebView2 のプロセスをコマンドラインで絞り込む部分と `WorkingSetPrivate` を読む部分は、手で測るときと同じものである必要がある（[measurements > memory §3](../../docs/measurements/06-memory.md)）。
 */
function processMemory(label: string): ProcessMemory {
  const out = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', SCRIPT, '-Label', label, '-Json'], {
    encoding: 'utf8',
  });
  return JSON.parse(out) as ProcessMemory;
}

type PageMemory = Pick<MemorySample, 'jsHeapMB' | 'jsHeapTotalMB' | 'domNodes' | 'contentBlocks'>;

/** CDP `Memory.getDOMCounters` の値。 */
export interface DomCounters {
  blinkNodes: number | null;
  blinkDocuments: number | null;
  jsEventListeners: number | null;
}

/** WebView 側の値。 */
async function pageMemory(): Promise<PageMemory> {
  return browser.execute(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })
      .memory;
    const mb = (bytes: number) => Math.round(bytes / 1024 / 102.4) / 10;
    return {
      jsHeapMB: memory ? mb(memory.usedJSHeapSize) : null,
      jsHeapTotalMB: memory ? mb(memory.totalJSHeapSize) : null,
      domNodes: document.querySelectorAll('*').length,
      contentBlocks: document.querySelectorAll('#mx-preview .mx-content > *').length,
    };
  });
}

function toSample(label: string, page: PageMemory, counters: DomCounters): MemorySample {
  const measured = processMemory(label);
  return {
    label,
    at: measured.Timestamp,
    processMB: measured.TotalMB,
    mainMB: measured.MainMB,
    webViewMB: measured.WebViewMB,
    byType: measured.ByType,
    ...page,
    ...counters,
  };
}

/**
 * CDP を使うか。`MX_MEMORY_CDP=0` で切れる。
 *
 * 切れるようにしてあるのは、CDP そのものが計測を汚していないかを確かめるためである。
 * 実測（2026-09-07）では、CDP を使う計測だけが 1 往復あたり 20MB の線形増加を示し、ドライバを介さない手計測では 6 往復しても横ばいだった。
 */
const USE_CDP = process.env['MX_MEMORY_CDP'] !== '0';

/** 1 点を測る。 */
export async function sample(label: string): Promise<MemorySample> {
  const counters = USE_CDP ? await domCounters() : EMPTY_COUNTERS;
  return toSample(label, await pageMemory(), counters);
}

const EMPTY_COUNTERS: DomCounters = { blinkNodes: null, blinkDocuments: null, jsEventListeners: null };

/**
 * プロセスだけを測る。**`purgeJsMemory()` の後はこちらしか使えない**（同関数の但し書き）。
 */
export function sampleProcessOnly(label: string): MemorySample {
  return toSample(label, { jsHeapMB: null, jsHeapTotalMB: null, domNodes: null, contentBlocks: null }, EMPTY_COUNTERS);
}

/**
 * CDP のコマンドを 1 つ送る。
 *
 * msedgedriver が `/session/:id/ms/cdp/execute` で受ける（Chrome 系の `goog/cdp/execute` は 404）。
 * tauri-driver は未知のエンドポイントもそのまま中継するため、WebDriver のセッションをそのまま使える。
 */
async function cdp<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${DRIVER_PORT}/session/${browser.sessionId}/ms/cdp/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cmd: command, params }),
  });
  if (!response.ok) {
    throw new Error(`CDP ${command} が失敗した: ${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as { value: T }).value;
}

/**
 * レンダラが抱えている DOM の数（CDP `Memory.getDOMCounters`）。
 *
 * `performance.memory` では見えない。
 * DOM のノードは V8 ではなく Blink 側のヒープ（Oilpan）に載るため、切り離されたツリーを 1 か所から掴んでいても JS ヒープにはラッパー 1 個ぶんしか現れない。
 * 候補 3（切り離された DOM が到達可能なまま）を潰せるのはこの値だけである。
 */
export async function domCounters(): Promise<DomCounters> {
  const counters = await cdp<{ documents: number; nodes: number; jsEventListeners: number }>('Memory.getDOMCounters');
  return {
    blinkNodes: counters.nodes,
    blinkDocuments: counters.documents,
    jsEventListeners: counters.jsEventListeners,
  };
}

/**
 * 強制 GC。
 *
 * `--js-flags=--expose-gc` では `gc()` が生えないため CDP を使う（`MEMORY_PROBE_BROWSER_ARGUMENTS`）。
 * 2 回呼ぶのは、1 回では弱参照の解放と、それによって到達不能になったものの回収が同じ回に入らないためである。
 */
export async function forceGc(): Promise<void> {
  if (!USE_CDP) return;
  for (let i = 0; i < 2; i++) {
    await cdp('HeapProfiler.collectGarbage');
    await browser.pause(300);
  }
}

/**
 * メモリ圧を通知する（CDP `Memory.simulatePressureNotification`）。
 *
 * Blink はこれを受けると各種キャッシュを捨て、PartitionAlloc の空きページを OS へ返す。
 * GC でも DOM の数でも説明が付かないぶんが「解放済みだが返していないだけ」なのかは、これでしか分けられない。
 */
export async function simulateMemoryPressure(): Promise<void> {
  if (!USE_CDP) return;
  await cdp('Memory.simulatePressureNotification', { level: 'critical' });
  await browser.pause(2000);
}

/**
 * 回収済みの領域を OS へ返させる。
 *
 * GC で到達不能になっても、V8 と PartitionAlloc はページを手元に残すことがある。
 * これを呼ぶことで「解放されていない」と「OS へ返していないだけ」を分けられる。
 *
 * **呼んだ後はページ側を読めない。**
 * 実測（2026-09-07）では、このコマンドの後の `browser.execute` が返らなくなる（180 秒で bidi のタイムアウト）。
 * 本来はバックグラウンドのタブに対する操作であり、生きているページに使う前提のものではない。
 * 計測の最後に置き、以降は `sampleProcessOnly()` で測る。
 */
export async function purgeJsMemory(): Promise<void> {
  if (!USE_CDP) return;
  await cdp('Memory.forciblyPurgeJavaScriptMemory');
  await browser.pause(1000);
}

/**
 * 段階的描画が終わるまで待つ。入ったブロック数を返す。
 *
 * 完了を製品コードから受け取らない。
 * `paint()` の `done` を外へ晒すのはテスト専用の裏口になる（`e2e/README.md`）。
 * ブロック数が増えなくなったことで代用する。
 */
export async function waitForPaintSettled(): Promise<number> {
  let last = -1;
  let stable = 0;

  await browser.waitUntil(
    async () => {
      const count = await browser.execute(() => document.querySelectorAll('#mx-preview .mx-content > *').length);
      stable = count === last ? stable + 1 : 0;
      last = count;
      return stable >= 4 && count > 0;
    },
    { timeout: 180_000, interval: 250, timeoutMsg: '段階的描画が終わらなかった' },
  );

  return last;
}

/** 計測結果を JSON に書く。 */
export function writeReport(samples: MemorySample[], notes: Record<string, unknown>): string {
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...notes, samples }, null, 2)}\n`);
  return REPORT;
}

/** 標準出力へ表にして出す。JSON を開かなくても結論が読める状態にしておく。 */
export function printReport(samples: MemorySample[]): void {
  const rows = samples.map((s) => ({
    label: s.label,
    'process(MB)': s.processMB,
    'renderer(MB)': s.byType['renderer'] ?? '-',
    'gpu(MB)': s.byType['gpu-process'] ?? '-',
    'browser(MB)': s.byType['browser'] ?? '-',
    'jsHeap(MB)': s.jsHeapMB ?? '-',
    'jsHeapTotal(MB)': s.jsHeapTotalMB ?? '-',
    domNodes: s.domNodes ?? '-',
    blinkNodes: s.blinkNodes ?? '-',
    listeners: s.jsEventListeners ?? '-',
  }));
  console.table(rows);
}
