/**
 * 数式記法をプレースホルダにする markdown-it プラグイン（F-VIEW-13 / 04.tech-stack/04-markdown.md §4）。
 *
 * ここは記法の範囲を決めるだけで、KaTeX を呼ばない。
 * 描画は `features/preview/lazy/math.ts` が遅延チャンクで行う。
 * パーサ側のプラグイン（`markdown-it-katex` 相当）を pipeline に載せるほどの残余が critical path に無い。
 *
 * 出力するプレースホルダは元の TeX をテキストとして持つ。
 * 描画される前や失敗したときは、その TeX がそのまま読める状態で残る。
 *
 * `lineMapPlugin` より前に `use` すること（`math_block` の `data-line` はあちらが付ける）。
 */
import type { MarkdownIt, StateBlock, StateInline, Token } from 'markdown-it';

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;
const NEWLINE = 0x0a;
const ZERO = 0x30;
const NINE = 0x39;

/** 空白か改行か。開始記号の直後と終了記号の直前を除外するために使う。 */
function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === NEWLINE;
}

/**
 * インラインの数式（`$...$` と `$$...$$`）。
 *
 * 通貨の表記を数式にしないため、次の 3 つを満たすものだけを対象にする。
 * 開始記号の直後が空白でないこと、終了記号の直前が空白でないこと、終了記号の直後が数字でないこと。
 * `$5 と $10` は 3 つ目に該当するため数式にならない。
 *
 * 行をまたぐ書き方は認めない。
 * 認めると、閉じ忘れた `$` から段落の末尾までが数式になる。
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== DOLLAR) return false;

  const display = state.src.charCodeAt(start + 1) === DOLLAR;
  const markerLength = display ? 2 : 1;
  const contentStart = start + markerLength;
  if (contentStart >= state.posMax) return false;
  if (isSpace(state.src.charCodeAt(contentStart))) return false;

  let pos = contentStart;
  let end = -1;
  while (pos < state.posMax) {
    const code = state.src.charCodeAt(pos);
    if (code === BACKSLASH) {
      pos += 2;
      continue;
    }
    if (code === NEWLINE) return false;
    if (code === DOLLAR && (!display || state.src.charCodeAt(pos + 1) === DOLLAR)) {
      end = pos;
      break;
    }
    pos++;
  }
  if (end === -1 || end === contentStart) return false;
  if (isSpace(state.src.charCodeAt(end - 1))) return false;

  const after = state.src.charCodeAt(end + markerLength);
  if (after >= ZERO && after <= NINE) return false;

  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.markup = display ? '$$' : '$';
    token.content = state.src.slice(contentStart, end);
  }

  state.pos = end + markerLength;
  return true;
}

/** 字下げを除いた行頭の位置。 */
function lineStart(state: StateBlock, line: number): number {
  return (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);
}

/**
 * ブロックの数式（`$$` で始まる行）。
 *
 * 閉じていないものは数式にしない（`false` を返して段落として扱わせる）。
 * 末尾まで取り込む実装にすると、`$$` を 1 つ書き損なっただけで以降の本文が全部消える。
 */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = lineStart(state, startLine);
  const max = state.eMarks[startLine] ?? 0;

  // 4 スペース以上の字下げはコードブロックである（`code` ルールが先に処理する）
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false;
  if (start + 2 > max) return false;
  if (state.src.charCodeAt(start) !== DOLLAR || state.src.charCodeAt(start + 1) !== DOLLAR) return false;

  const firstLine = state.src.slice(start + 2, max).trimEnd();

  let content: string;
  let lastLine: number;

  if (firstLine.endsWith('$$')) {
    // `$$x$$` の 1 行で閉じている
    content = firstLine.slice(0, -2);
    lastLine = startLine;
  } else {
    const parts = [firstLine];
    let closed = false;
    lastLine = startLine;

    for (let line = startLine + 1; line < endLine; line++) {
      const text = state.src.slice(lineStart(state, line), state.eMarks[line] ?? 0).trimEnd();
      if (text.endsWith('$$')) {
        parts.push(text.slice(0, -2));
        lastLine = line;
        closed = true;
        break;
      }
      parts.push(text);
    }
    if (!closed) return false;
    content = parts.join('\n');
  }

  // 前後の空白は除く。行ごとの字下げは `lineStart` の時点で既に除かれている（TeX では意味を持たない）。
  content = content.trim();
  if (content === '') return false;
  if (silent) return true;

  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.markup = '$$';
  token.content = content;
  token.map = [startLine, lastLine + 1];

  state.line = lastLine + 1;
  return true;
}

/**
 * 数式のプレースホルダを出力する（F-VIEW-13）。
 *
 * インラインは `$$...$$` で書かれた場合も `<span>` のままにする。
 * `<p>` の内側に `<div>` を出すと、ブラウザが段落を勝手に閉じて `data-line` の対応が崩れる。
 * 表示形式の指定は `data-mx-math` で渡し、KaTeX の `displayMode` へ変換するのは描画側の仕事とする。
 */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  const escape = md.utils.escapeHtml;

  md.renderer.rules['math_inline'] = (tokens: Token[], idx: number): string => {
    const token = tokens[idx];
    const mode = token?.markup === '$$' ? 'inline-display' : 'inline';
    return `<span class="mx-math" data-mx-math="${mode}">${escape(token?.content ?? '')}</span>`;
  };

  md.renderer.rules['math_block'] = (tokens: Token[], idx: number): string =>
    `<div class="mx-math" data-mx-math="block">${escape(tokens[idx]?.content ?? '')}</div>\n`;
}
