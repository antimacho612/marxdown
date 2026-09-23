#!/usr/bin/env node
/**
 * 05.performance-budget/03-fixtures.md の基準ファイルセットを生成する。
 *
 * 生成物は Git に入れない（huge.md 2MB / extreme.md 10MB のため）。
 * 代わりに本スクリプトを唯一の真実とし、シードを固定して再現性を担保する。
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bench', 'fixtures');

/** xorshift32。Math.random() では生成物が毎回変わり、計測値を比較できなくなる。 */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

const WORDS_EN =
  'the quick brown fox jumps over lazy dog markdown parser renderer document viewer performance budget critical path bundle worker thread latency throughput cold start warm start decoration extension pipeline sanitize outline heading paragraph'.split(
    ' ',
  );
const WORDS_JA =
  'マークダウン 設計 実装 起動 速度 予算 描画 解析 拡張 見出し 段落 引用 表 図 数式 検証 計測 記録 判断 土台 単一 インスタンス 転送 常駐 解放 監視 遅延 読み込み 境界 正規化'.split(
    ' ',
  );
const LANGS = ['ts', 'rust', 'json', 'bash', 'python', 'sql', 'yaml'];

const NL = String.fromCharCode(10);

const pad = (n, w) => String(n).padStart(w, '0');

/** 出力サイズはバイトで測る。`.length` は UTF-16 コード単位であり、日本語を含むと大きくずれる。 */
function bytesOf(lines) {
  return Buffer.byteLength(lines.join(NL), 'utf8');
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function sentence(rng, jaRatio = 0.35) {
  const n = 6 + Math.floor(rng() * 14);
  const ja = rng() < jaRatio;
  const src = ja ? WORDS_JA : WORDS_EN;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(rng, src));
  return ja ? parts.join('') + '。' : parts.join(' ') + '.';
}

function paragraph(rng, sentences = 3) {
  const out = [];
  for (let i = 0; i < sentences; i++) out.push(sentence(rng));
  return out.join(' ');
}

function codeBlock(rng, lines = 8) {
  const lang = pick(rng, LANGS);
  const body = [];
  for (let i = 0; i < lines; i++) {
    body.push('  const value' + i + ' = compute(' + Math.floor(rng() * 1000) + ', "' + sentence(rng, 0) + '")');
  }
  return ['```' + lang, ...body, '```'].join('\n');
}

function table(rng, rows = 5) {
  const out = ['| 項目 | 目標 | 許容上限 | 備考 |', '| --- | --- | --- | --- |'];
  for (let i = 0; i < rows; i++) {
    out.push(
      '| ' +
        pick(rng, WORDS_JA) +
        ' | ' +
        Math.floor(rng() * 900) +
        'ms | ' +
        Math.floor(rng() * 2000) +
        'ms | ' +
        sentence(rng, 0.8) +
        ' |',
    );
  }
  return out.join('\n');
}

function list(rng, items = 5, ordered = false) {
  const out = [];
  for (let i = 0; i < items; i++) {
    out.push((ordered ? i + 1 + '.' : '-') + ' ' + sentence(rng));
    if (rng() < 0.3) out.push('  ' + (ordered ? '1.' : '-') + ' ' + sentence(rng));
  }
  return out.join('\n');
}

function tiny(rng) {
  const out = ['# tiny.md — LLM の短い回答を模したファイル', ''];
  for (let i = 0; i < 3; i++) {
    out.push('## ' + sentence(rng, 0.9).slice(0, 30), '', paragraph(rng, 2), '');
  }
  out.push(codeBlock(rng, 5), '', list(rng, 4), '');
  return out.join('\n');
}

function readme(rng) {
  const out = [
    '# readme.md — 最頻ケース',
    '',
    '![build](https://img.shields.io/badge/build-passing-brightgreen)',
    '![license](https://img.shields.io/badge/license-MIT-blue)',
    '',
    paragraph(rng, 4),
    '',
    '## インストール',
    '',
    codeBlock(rng, 4),
    '',
    '## 使い方',
    '',
    paragraph(rng, 3),
    '',
    codeBlock(rng, 10),
    '',
    '## オプション',
    '',
    table(rng, 8),
    '',
    '## 注意点',
    '',
    list(rng, 6),
    '',
    '> ' + sentence(rng),
    '',
    '## ライセンス',
    '',
    paragraph(rng, 2),
    '',
    '[MIT](./LICENSE) / [CONTRIBUTING](./CONTRIBUTING.md) / <https://example.com/>',
    '',
  ];
  while (bytesOf(out) < 12 * 1024) {
    out.push('### ' + sentence(rng, 0.9).slice(0, 40), '', paragraph(rng, 2), '');
  }
  return out.join('\n');
}

/** spec.md: 見出し 200 / コードブロック 80 / 表 30、およそ 120KB */
function spec(rng) {
  const out = ['# spec.md — 長い設計書', '', paragraph(rng, 5), ''];
  let headings = 1;
  let codes = 0;
  let tables = 0;
  let section = 0;
  // 見出し 200 / コードブロック 80 / 表 30 をすべて満たすまで回す。
  // 1 セクションを約 600B に抑えることで、合計が 120KB 前後に着地する。
  while (headings < 200 || codes < 80 || tables < 30) {
    section++;
    const level = 2 + (section % 3);
    out.push('#'.repeat(level) + ' ' + section + '. ' + sentence(rng, 0.9).slice(0, 48), '');
    headings++;
    out.push(paragraph(rng, 1 + Math.floor(rng() * 2)), '');
    if (codes < 80 && rng() < 0.42) {
      out.push(codeBlock(rng, 3 + Math.floor(rng() * 4)), '');
      codes++;
    }
    if (tables < 30 && rng() < 0.17) {
      out.push(table(rng, 3), '');
      tables++;
    }
    if (rng() < 0.2) out.push(list(rng, 2, rng() < 0.4), '');
    if (rng() < 0.1) out.push('> **注意**: ' + sentence(rng), '');
    if (section > 400) break; // 暴走防止
  }
  return out.join('\n');
}

/** huge.md: 2MB。spec.md と同じ質感のまま量だけ増やす。 */
function huge(rng, targetBytes) {
  const parts = ['# huge.md — 生成された巨大ドキュメント', ''];
  let bytes = 64;
  let section = 0;
  while (bytes < targetBytes) {
    section++;
    const chunk = [];
    chunk.push('## ' + section + '. ' + sentence(rng, 0.9).slice(0, 48), '');
    chunk.push(paragraph(rng, 4), '');
    if (rng() < 0.4) chunk.push(codeBlock(rng, 10 + Math.floor(rng() * 15)), '');
    if (rng() < 0.15) chunk.push(table(rng, 6), '');
    if (rng() < 0.3) chunk.push(list(rng, 5), '');
    const s = chunk.join('\n') + '\n';
    parts.push(s);
    bytes += Buffer.byteLength(s, 'utf8');
  }
  return parts.join('\n');
}

/** extreme.md: 10MB。ログのような単調テキスト（破綻しないことの確認用）。 */
function extreme(rng, targetBytes) {
  const parts = ['# extreme.md — ログのような単調テキスト', '', '```log'];
  let bytes = 64;
  let i = 0;
  while (bytes < targetBytes) {
    const line =
      '2026-08-23T' +
      pad(i % 24, 2) +
      ':' +
      pad(i % 60, 2) +
      ':' +
      pad((i * 7) % 60, 2) +
      '.' +
      pad(i % 1000, 3) +
      'Z INFO  [worker-' +
      (i % 8) +
      '] ' +
      sentence(rng, 0);
    parts.push(line);
    bytes += Buffer.byteLength(line, 'utf8') + 1;
    i++;
  }
  parts.push('```', '');
  return parts.join('\n');
}

function diagram(rng) {
  const out = ['# diagram.md — Mermaid 図 10 個', ''];
  const kinds = ['graph LR', 'graph TD', 'sequenceDiagram', 'stateDiagram-v2'];
  for (let d = 0; d < 10; d++) {
    out.push('## 図 ' + (d + 1), '', paragraph(rng, 2), '');
    const kind = kinds[d % kinds.length];
    const body = ['```mermaid', kind];
    if (kind.startsWith('graph')) {
      for (let i = 0; i < 8; i++)
        body.push('    N' + i + '[ノード' + i + '] --> N' + (i + 1) + '[ノード' + (i + 1) + ']');
      body.push('    N8 --> N0');
    } else if (kind === 'sequenceDiagram') {
      body.push('    participant A as アプリ', '    participant B as Worker');
      for (let i = 0; i < 8; i++) body.push('    A->>B: メッセージ' + i, '    B-->>A: 応答' + i);
    } else {
      body.push('    [*] --> S0');
      for (let i = 0; i < 6; i++) body.push('    S' + i + ' --> S' + (i + 1) + ': 遷移' + i);
      body.push('    S6 --> [*]');
    }
    body.push('```');
    out.push(body.join('\n'), '');
    out.push(paragraph(rng, 3), '');
  }
  while (bytesOf(out) < 30 * 1024) out.push(paragraph(rng, 3), '');
  return out.join('\n');
}

function math(rng) {
  const out = ['# math.md — 数式 200 個', ''];
  const inlineTpl = [
    'E = mc^2',
    '\\sum_{i=1}^{n} x_i',
    '\\frac{a}{b}',
    '\\alpha + \\beta',
    '\\int_0^1 f(x)\\,dx',
    'O(n \\log n)',
  ];
  const blockTpl = [
    '\\begin{aligned}\n f(x) &= ax^2 + bx + c \\\\\n g(x) &= 2ax + b\n\\end{aligned}',
    '\\sum_{k=0}^{N-1} e^{-2\\pi i k n / N} x_k',
    '\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
  ];
  let count = 0;
  let section = 0;
  while (count < 200) {
    section++;
    out.push('## ' + section + '. ' + sentence(rng, 0.9).slice(0, 36), '');
    out.push('ここで $' + pick(rng, inlineTpl) + '$ が成り立つ。', '');
    count++;
    if (count < 200 && rng() < 0.6) {
      out.push('$$', pick(rng, blockTpl), '$$', '');
      count++;
    }
  }
  while (bytesOf(out) < 20 * 1024) out.push(paragraph(rng, 2), '');
  return out.join('\n');
}

const FIXTURES = [
  ['tiny.md', () => tiny(makeRng(1))],
  ['readme.md', () => readme(makeRng(2))],
  ['spec.md', () => spec(makeRng(3))],
  ['huge.md', () => huge(makeRng(4), 2 * 1024 * 1024)],
  ['extreme.md', () => extreme(makeRng(5), 10 * 1024 * 1024)],
  ['diagram.md', () => diagram(makeRng(6))],
  ['math.md', () => math(makeRng(7))],
];

mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
for (const [name, build] of FIXTURES) {
  if (only.length > 0 && !only.includes(name)) continue;
  const path = join(OUT, name);
  // EOL は LF 固定。CRLF/BOM の検証は Rust 側のユニットテストで専用の入力を使う。
  writeFileSync(path, build().replaceAll('\r\n', '\n'), 'utf8');
  const kb = statSync(path).size / 1024;
  console.log(name.padEnd(12) + ' ' + (kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(1) + ' KB'));
}
