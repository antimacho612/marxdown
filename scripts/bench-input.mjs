#!/usr/bin/env node
/**
 * 入力レスポンス計測ハーネス（05.performance-budget/04-targets.md §3）。
 *
 * `--bench-input` を付けた実行ファイルを繰り返し起動し、Split で打鍵を合成して「打鍵 → 反映」と「打ち終わり → プレビュー反映」の分布を出す。
 *
 * ```bash
 * pnpm build                                      # release ビルドが必要
 * node scripts/bench-input.mjs                    # 既定（spec.md/huge.md × 3 回）
 * node scripts/bench-input.mjs --files spec.md --runs 5
 * node scripts/bench-input.mjs --json out.json
 * ```
 *
 * 比べるのは同じファイル・同じ run 数の値だけである。
 * Cold Start と同じく（measurements/03-cold-start.md §2）、絶対値は環境で振れる。
 * 意味を持つのは実装を変えた前後の差である（打鍵列はシード固定で毎回同じ）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'bench', 'fixtures');
const TMP = join(ROOT, 'node_modules', '.tmp', 'bench-input');

const EXE_CANDIDATES = [
  join(ROOT, 'src-tauri', 'target', 'release', 'marxdown.exe'),
  join(ROOT, 'src-tauri', 'target', 'release', 'marxdown'),
  join(ROOT, 'src-tauri', 'target', 'debug', 'marxdown.exe'),
  join(ROOT, 'src-tauri', 'target', 'debug', 'marxdown'),
];

/** 05.performance-budget/04-targets.md の入力レスポンス。 */
const INPUT_BUDGET_MS = 16;

function parseArgs(argv) {
  const out = {
    runs: 3,
    files: ['spec.md', 'huge.md'],
    json: null,
    timeoutMs: 180_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--runs':
        out.runs = Number(next());
        break;
      case '--files':
        out.files = next().split(',');
        break;
      case '--json':
        out.json = next();
        break;
      case '--timeout':
        out.timeoutMs = Number(next());
        break;
      default:
        console.error(`未知の引数: ${arg}`);
        process.exit(2);
    }
  }
  return out;
}

function findExe() {
  const exe = EXE_CANDIDATES.find((p) => existsSync(p));
  if (!exe) {
    console.error('実行ファイルが見つからない。先に `pnpm build:app` を実行する。');
    process.exit(1);
  }
  if (exe.includes('debug')) {
    console.warn('⚠ debug ビルドを計測している。05.performance-budget/02-environment.md は release を要求する。');
  }
  return exe;
}

/**
 * 1 回起動して、書き出された JSON を読む。
 *
 * 単一インスタンスに注意（ADR-0004）。普段使いの Marxdown が起動していると、ここで起動したプロセスは argv を転送して即座に終わり、JSON が出ない。
 * E2E と同じ問題であるため、出なかったときはその可能性を表示する。
 */
function runOnce(exe, file, outPath, timeoutMs) {
  return new Promise((resolve) => {
    rmSync(outPath, { force: true });
    /*
     * 未知のフラグを渡さないこと。
     *
     * `cli.rs` は解釈できなかった `--foo` を警告に加えるだけで止まらず、その値をファイルパスとして扱う。
     * 存在しないファイルを開こうとして本来のファイルが開かれないまま計測が進む。
     *
     * 症状は「打鍵は測れるのにプレビューの再描画が 0 件」で、製品の回帰と見分けが付かない。
     */
    const args = ['--mode', 'split', '--bench-input', outPath, file];

    const child = spawn(exe, args, { stdio: 'ignore', windowsHide: true });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    child.on('exit', () => {
      clearTimeout(timer);
      if (!existsSync(outPath)) {
        resolve({ ok: false, reason: 'no-output' });
        return;
      }
      try {
        resolve({ ok: true, report: JSON.parse(readFileSync(outPath, 'utf8')) });
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

/**
 * run をまたいで生のサンプルから取り直す。
 *
 * run ごとの p95 を平均してはいけない。分位数は平均できない。
 */
function merge(reports, pick) {
  const values = reports.flatMap(pick);
  if (values.length === 0) return { n: 0, p50: Number.NaN, p95: Number.NaN, max: Number.NaN, mean: Number.NaN };
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted.at(-1),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

function summarize(reports) {
  return {
    keyResponseMs: merge(reports, (r) => r.samples.keys.map((s) => s.responseMs)),
    keyLatencyMs: merge(reports, (r) => r.samples.keys.map((s) => s.latencyMs)),
    keyWaitMs: merge(reports, (r) => r.samples.keys.map((s) => s.waitMs)),
    keyTypeMs: merge(reports, (r) => r.samples.keys.map((s) => s.typeMs)),
    previewTotalMs: merge(reports, (r) => r.samples.previews.map((s) => s.totalMs)),
    previewParseWaitMs: merge(reports, (r) => r.samples.previews.map((s) => s.parseWaitMs)),
    previewParseMs: merge(reports, (r) => r.samples.previews.map((s) => s.parseMs)),
    previewPaintMs: merge(reports, (r) => r.samples.previews.map((s) => s.paintMs)),
  };
}

const ROWS = [
  ['keyResponseMs', '打鍵が届く → エディター反映  ★予算'],
  ['keyTypeMs', '  うち Monaco の編集'],
  ['keyLatencyMs', '予定時刻 → エディター反映'],
  ['keyWaitMs', '  うち打鍵が待たされた分'],
  ['previewTotalMs', '打ち終わり → プレビュー反映'],
  ['previewParseWaitMs', '  うちパース（往復 / 占有）'],
  ['previewParseMs', '  うちパース本体の申告値'],
  ['previewPaintMs', '  うち paint + enhance'],
];

function printTable(title, summary) {
  console.log(`\n${'='.repeat(78)}`);
  console.log(title);
  console.log('='.repeat(78));
  console.log('                                     n      p50      p95      max     平均');
  for (const [key, label] of ROWS) {
    const s = summary[key];
    console.log(
      `  ${label.padEnd(32)} ${String(s.n).padStart(5)} ${fmt(s.p50)} ${fmt(s.p95)} ${fmt(s.max)} ${fmt(s.mean)}`,
    );
  }
}

function fmt(v) {
  return Number.isNaN(v) ? '      -' : v.toFixed(1).padStart(8);
}

const opts = parseArgs(process.argv.slice(2));
mkdirSync(TMP, { recursive: true });

const exe = findExe();
const report = { generatedAt: new Date().toISOString(), exe, runs: opts.runs, results: {} };

for (const fileName of opts.files) {
  const file = join(FIXTURES, fileName);
  if (!existsSync(file)) {
    console.error(`fixture が無い: ${file}\n先に \`pnpm fixtures\` を実行する。`);
    process.exit(1);
  }

  const reports = [];
  for (let i = 0; i < opts.runs; i++) {
    process.stdout.write(`  ${fileName} / run ${i + 1}...
`);
    const r = await runOnce(exe, file, join(TMP, `${fileName}-${i}.json`), opts.timeoutMs);
    if (!r.ok) {
      console.warn(`    失敗: ${r.reason}`);
      if (r.reason === 'no-output') {
        console.warn('    Marxdown が既に起動していないか確認すること（単一インスタンス / ADR-0004）。');
      }
      continue;
    }
    if (r.report.error) console.warn(`    計測側のエラー: ${r.report.error}`);

    /*
     * 予約されたのに 1 度も始まっていないなら、その run は計測になっていない。
     * ファイルが開けていないとこの形で出る（`documentStore.meta` が無いと `renderNow` はガードで抜ける）。
     * 警告なしに「プレビューの行だけ空の表」を出すと、製品の回帰と見分けが付かない。
     */
    const live = r.report.diagnostics?.live;
    if (live && live.scheduled > 0 && live.started === 0) {
      console.warn(
        `    ⚠ 描き直しが 1 度も始まっていない（hasMeta=${r.report.diagnostics.hasMeta} / ` +
          `hasParser=${r.report.diagnostics.hasParser}）。ファイルが開けていない可能性がある。`,
      );
    }
    reports.push(r.report);
  }

  if (reports.length === 0) {
    console.error(`${fileName}: 有効な計測が 1 件も取れなかった。`);
    continue;
  }

  const summary = summarize(reports);
  report.results[fileName] = summary;
  printTable(`${fileName} — ${reports.length} run`, summary);

  const verdict = summary.keyResponseMs.p95 <= INPUT_BUDGET_MS ? '✓' : '✗';
  console.log(
    `
  ${verdict} 打鍵が届く → 反映 p95 = ${summary.keyResponseMs.p95.toFixed(1)}ms（予算 ${INPUT_BUDGET_MS}ms）`,
  );
}

if (opts.json) {
  writeFileSync(opts.json, JSON.stringify(report, null, 2));
  console.log(`\n結果を書き出した: ${opts.json}`);
}
