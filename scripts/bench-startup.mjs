#!/usr/bin/env node
/**
 * 起動計測ハーネス（05.performance-budget.md §5.2）。
 *
 * `--trace-startup` を付けた実行ファイルを繰り返し起動し、T0〜T9 の中央値を出す。
 * 初回はファイルキャッシュの影響が大きいため、**別枠で記録する**（§2）。
 *
 * ```bash
 * pnpm build:app                       # release ビルドが必要
 * node scripts/bench-startup.mjs                       # 既定（cold, readme.md）
 * node scripts/bench-startup.mjs --runs 10 --file spec.md
 * node scripts/bench-startup.mjs --sweep               # S2/S3/S7/S8 の A/B を総当たり
 * node scripts/bench-startup.mjs --warm --runs 10      # S6 のウォーム起動
 * node scripts/bench-startup.mjs --json out.json       # 結果を JSON で保存
 * ```
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'bench', 'fixtures');
const TMP = join(ROOT, 'node_modules', '.tmp', 'bench-startup');

const EXE_CANDIDATES = [
  join(ROOT, 'src-tauri', 'target', 'release', 'marxdown.exe'),
  join(ROOT, 'src-tauri', 'target', 'release', 'marxdown'),
  join(ROOT, 'src-tauri', 'target', 'debug', 'marxdown.exe'),
  join(ROOT, 'src-tauri', 'target', 'debug', 'marxdown'),
];

/** T0 起点のマーカーの意味（05.performance-budget.md §5.2）。 */
const MARK_LABELS = {
  T0: 'プロセス起動',
  T1: 'CLI 引数解析完了',
  T2: 'ファイル読み込み完了',
  T2b: 'Tauri ブート + プラグイン初期化完了',
  T2c: 'ウィンドウ状態の復元判定完了',
  T3: 'WebviewWindow 生成呼び出し完了',
  T4: '初期スクリプト評価開始',
  T5: 'bootstrap 読み取り完了',
  T6: 'Worker への parse 送信',
  T7: 'Worker から HTML 受信',
  T8: '本文の DOM 挿入完了 + 次の rAF  ← 読める瞬間',
  'T8-all': '全チャンクの描画完了',
  T9: 'window.show() 呼び出し',
};

/* ------------------------------------------------------------------ */
/* 引数                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    runs: 10,
    file: 'readme.md',
    sweep: false,
    warm: false,
    json: null,
    timeoutMs: 20_000,
    spike: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--runs':
        out.runs = Number(next());
        break;
      case '--file':
        out.file = next();
        break;
      case '--sweep':
        out.sweep = true;
        break;
      case '--warm':
        out.warm = true;
        break;
      case '--json':
        out.json = next();
        break;
      case '--timeout':
        out.timeoutMs = Number(next());
        break;
      case '--bootstrap':
      case '--parse':
      case '--paint':
      case '--render':
        out.spike[arg.slice(2)] = next();
        break;
      default:
        console.error(`未知の引数: ${arg}`);
        process.exit(2);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 実行                                                                */
/* ------------------------------------------------------------------ */

function findExe() {
  const exe = EXE_CANDIDATES.find((p) => existsSync(p));
  if (!exe) {
    console.error('実行ファイルが見つからない。先に `pnpm build:app` を実行する。');
    console.error('探した場所:');
    for (const p of EXE_CANDIDATES) console.error(`  ${p}`);
    process.exit(1);
  }
  if (exe.includes('debug')) {
    console.warn('⚠ debug ビルドを計測している。05.performance-budget.md §2 は release を要求する。');
  }
  return exe;
}

function spikeArgs(spike) {
  return Object.entries(spike).flatMap(([k, v]) => [`--spike-${k}`, v]);
}

/** 1 回起動して、書き出されたトレース JSON を読む。 */
function runOnce(exe, file, tracePath, spike, timeoutMs) {
  return new Promise((resolve) => {
    rmSync(tracePath, { force: true });
    const started = process.hrtime.bigint();
    const child = spawn(exe, ['--trace-startup', tracePath, '--exit-after-trace', ...spikeArgs(spike), file], {
      stdio: 'ignore',
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    child.on('exit', () => {
      clearTimeout(timer);
      const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (!existsSync(tracePath)) {
        resolve({ ok: false, reason: 'no-trace' });
        return;
      }
      try {
        resolve({ ok: true, wallMs, trace: JSON.parse(readFileSync(tracePath, 'utf8')) });
      } catch (e) {
        resolve({ ok: false, reason: String(e) });
      }
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: String(e) });
    });
  });
}

/* ------------------------------------------------------------------ */
/* 集計                                                                */
/* ------------------------------------------------------------------ */

function median(values) {
  if (values.length === 0) return Number.NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function summarize(results) {
  const byMark = new Map();
  for (const r of results) {
    for (const m of r.trace.marks ?? []) {
      const list = byMark.get(m.id) ?? [];
      list.push(m.atMs);
      byMark.set(m.id, list);
    }
  }
  // T2b / T2c は T2→T3 の内訳（M1 で追加）。ここが伸びたときに
  // 「WebView2 が重いのか、自分たちが足したものが重いのか」を切り分ける。
  const order = ['T0', 'T1', 'T2', 'T2b', 'T2c', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T8-all', 'T9'];
  const marks = [];
  for (const id of order) {
    const values = byMark.get(id);
    if (!values) continue;
    marks.push({
      id,
      label: MARK_LABELS[id] ?? '',
      medianMs: median(values),
      minMs: Math.min(...values),
      maxMs: Math.max(...values),
      n: values.length,
    });
  }
  return {
    marks,
    wallMedianMs: median(results.map((r) => r.wallMs)),
    /** 「読める」瞬間 = T8。これが Cold Start の定義（§4.1）。 */
    readableMs: median(byMark.get('T8') ?? []),
  };
}

function printSummary(title, summary, firstRun) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(title);
  console.log('='.repeat(72));
  console.log('  mark      中央値      最小      最大   内訳            意味');
  let prev = 0;
  for (const m of summary.marks) {
    const delta = m.medianMs - prev;
    prev = m.medianMs;
    console.log(
      `  ${m.id.padEnd(7)} ${m.medianMs.toFixed(1).padStart(8)}ms ${m.minMs.toFixed(1).padStart(8)} ${m.maxMs
        .toFixed(1)
        .padStart(8)}   ${('+' + delta.toFixed(1)).padStart(8)}ms   ${m.label}`,
    );
  }
  console.log(`\n  Cold Start (T8, 中央値): ${summary.readableMs.toFixed(1)}ms`);
  console.log(`  プロセス全体の実時間     : ${summary.wallMedianMs.toFixed(1)}ms`);
  if (firstRun !== undefined) {
    console.log(`  初回（キャッシュ未温）   : ${firstRun.toFixed(1)}ms  ※ §2 により別枠`);
  }
  // 05.performance-budget.md §4.1
  const verdict =
    summary.readableMs <= 600
      ? '✓ 目標 600ms 以内'
      : summary.readableMs <= 900
        ? '△ 許容上限 900ms 以内'
        : '✗ 許容上限 900ms 超過';
  console.log(`  判定                     : ${verdict}`);
}

/* ------------------------------------------------------------------ */
/* ウォーム起動 (S6)                                                   */
/* ------------------------------------------------------------------ */

async function benchWarm(exe, files, opts) {
  const tracePath = join(TMP, 'warm.json');
  const warmLog = `${tracePath}.warm.jsonl`;
  rmSync(warmLog, { force: true });

  console.log('常駐プロセスを起動している...');
  const host = spawn(exe, ['--trace-startup', tracePath, ...spikeArgs(opts.spike), files[0]], {
    stdio: 'ignore',
    windowsHide: true,
  });

  // 1 プロセス目が listen を始めるまで待つ。トレース JSON の出現を合図にする。
  const ready = await waitFor(() => existsSync(tracePath), opts.timeoutMs);
  if (!ready) {
    host.kill();
    console.error('常駐プロセスが起動しなかった。');
    process.exit(1);
  }

  const wall = [];
  for (let i = 0; i < opts.runs; i++) {
    const file = files[(i + 1) % files.length];
    const started = process.hrtime.bigint();
    await new Promise((resolve) => {
      // 2 番目のプロセスは argv を転送して即座に終了する（ADR-0004）
      const second = spawn(exe, [file], { stdio: 'ignore', windowsHide: true });
      second.on('exit', resolve);
      second.on('error', resolve);
    });
    wall.push(Number(process.hrtime.bigint() - started) / 1e6);
    // 前の描画が終わってから次を投げる
    await waitFor(() => countLines(warmLog) >= i + 1, 5000);
  }

  await waitFor(() => countLines(warmLog) >= opts.runs, 5000);
  host.kill();

  const records = existsSync(warmLog)
    ? readFileSync(warmLog, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  console.log(`\n${'='.repeat(72)}`);
  console.log('S6 — ウォーム起動（単一インスタンス + argv 転送）');
  console.log('='.repeat(72));
  if (records.length === 0) {
    console.log('  記録が取れなかった。単一インスタンスが機能していない可能性がある。');
    return { records: [], summary: null };
  }
  const elapsed = records.map((r) => r.elapsedMs);
  const summary = {
    n: records.length,
    forwardToReadableMedianMs: median(elapsed),
    forwardToReadableMinMs: Math.min(...elapsed),
    forwardToReadableMaxMs: Math.max(...elapsed),
    secondProcessWallMedianMs: median(wall),
  };
  console.log(`  計測回数                          : ${summary.n}`);
  console.log(`  argv 受信 → 本文が読める (中央値) : ${summary.forwardToReadableMedianMs.toFixed(1)}ms`);
  console.log(
    `    最小 / 最大                     : ${summary.forwardToReadableMinMs.toFixed(1)} / ${summary.forwardToReadableMaxMs.toFixed(1)}ms`,
  );
  console.log(`  2 番目のプロセスの実時間 (中央値) : ${summary.secondProcessWallMedianMs.toFixed(1)}ms`);
  console.log('    ※ 転送してすぐ終了するプロセスの寿命。上の値と時間的に重なる。');
  const total = summary.forwardToReadableMedianMs;
  const verdict = total <= 120 ? '✓ 目標 120ms 以内' : total <= 250 ? '△ 許容上限 250ms 以内' : '✗ 許容上限 250ms 超過';
  console.log(`  判定                              : ${verdict}`);
  return { records, summary };
}

function countLines(path) {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).length;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

const opts = parseArgs(process.argv.slice(2));
mkdirSync(TMP, { recursive: true });

const exe = findExe();
const file = join(FIXTURES, opts.file);
if (!existsSync(file)) {
  console.error(`fixture が無い: ${file}\n先に \`pnpm fixtures\` を実行する。`);
  process.exit(1);
}

const report = { generatedAt: new Date().toISOString(), exe, runs: opts.runs, results: {} };

if (opts.warm) {
  const files = [file, join(FIXTURES, 'tiny.md'), join(FIXTURES, 'spec.md')].filter((p) => existsSync(p));
  const warm = await benchWarm(exe, files, opts);
  report.results.warm = warm.summary;
  report.results.warmRecords = warm.records;
} else {
  // A/B は S3（パース場所）だけが残っている。
  // S2 / S7 / S8 は結論が出たので M1 の終わりに撤去した（OQ-20）。
  const configs = opts.sweep
    ? [
        { name: '本命（Worker でパース）', spike: {} },
        { name: 'S3: メインスレッドでパース（OQ-18）', spike: { parse: 'main' } },
      ]
    : [{ name: `既定（${opts.file}）`, spike: opts.spike }];

  for (const config of configs) {
    const results = [];
    let firstRun;
    // §2: 初回はファイルキャッシュの影響が大きいため別枠で扱う
    const warmup = await runOnce(exe, file, join(TMP, 'warmup.json'), config.spike, opts.timeoutMs);
    if (warmup.ok) {
      firstRun = warmup.trace.marks?.find((m) => m.id === 'T8')?.atMs;
    }

    for (let i = 0; i < opts.runs; i++) {
      const r = await runOnce(exe, file, join(TMP, `run-${i}.json`), config.spike, opts.timeoutMs);
      if (r.ok) results.push(r);
      else console.warn(`  run ${i} 失敗: ${r.reason}`);
    }

    if (results.length === 0) {
      console.error(`${config.name}: 有効な計測が 1 件も取れなかった。`);
      continue;
    }

    const summary = summarize(results);
    printSummary(`${config.name} — ${opts.file}, ${results.length} 回`, summary, firstRun);
    report.results[config.name] = {
      ...summary,
      firstRunMs: firstRun,
      spike: config.spike,
      file: opts.file,
    };
  }
}

if (opts.json) {
  writeFileSync(opts.json, JSON.stringify(report, null, 2));
  console.log(`\n結果を書き出した: ${opts.json}`);
}
