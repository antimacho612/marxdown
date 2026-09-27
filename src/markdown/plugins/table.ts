/**
 * 表の描画を整える markdown-it プラグイン（F-VIEW-01）。
 *
 * 行うことは 3 つで、どれも Markdown のテキストからの派生（ADR-0002）であり、表の内容には触れない。
 *
 * 1. `<table>` を `<div class="mx-table">` で包む。横スクロールと端の処理を表の外側に持たせるため。
 * 2. GFM の揃え指定（`---:`）を `style` 属性から `data-mx-align` へ移す。
 *    `markdown/sanitize.ts` が `style` を除去するため、移さないと揃えが反映されない。
 * 3. 揃えの指定が無く、本文が数値だけの列に `data-mx-num` を付ける。
 *    LLM が生成した表は揃えを書かないことがほとんどで、数値が左寄せのままだと桁が揃わない。
 *
 * `lineMapPlugin` より前に `use` すること（`data-line` はあちらが付ける）。
 */
import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** 揃えの指定。markdown-it が `style="text-align:..."` として出力する値と対応する。 */
const ALIGNS = ['left', 'center', 'right'] as const;

type Align = (typeof ALIGNS)[number];

/**
 * 数値と見なす形。桁区切りと通貨記号と単位は先に除いてから判定する。
 *
 * 判定を緩くすると、ID や日付やバージョン番号の列まで右寄せになる。
 * 迷う形は数値として扱わない。
 */
const NUMERIC = /^[+-]?\d+(?:\.\d+)?$/;

/** 判定から除くセル。「値が無い」の意味で置かれるもので、これしか無い列は数値列にしない。 */
const NEUTRAL = new Set(['', '-', '--', '–', '—', 'ー', '/', 'n/a', 'na', '?', '不明', 'なし']);

/** 桁区切り・通貨記号・単位・空白を除く。`¥1,234` と `56.7 %` を数値として扱うため。 */
function normalizeNumber(text: string): string {
  return text
    .replaceAll(/[\s,，]/gu, '')
    .replace(/^[¥$€£￥]/u, '')
    .replace(/[%％]$/u, '');
}

/** 数値として扱えるか。 */
function isNumeric(text: string): boolean {
  return NUMERIC.test(normalizeNumber(text));
}

/** 揃えの指定を読む。markdown-it は `style="text-align:right"` の形で持たせる。 */
function alignOf(token: Token): Align | null {
  const style = token.attrGet('style');
  if (style === null) return null;
  return ALIGNS.find((align) => String(style).includes(`text-align:${align}`)) ?? null;
}

/** セル 1 つ分の情報。`token` は `th_open` / `td_open`、`text` はその中身。 */
interface Cell {
  token: Token;
  text: string;
}

/** 表 1 つ分。見出し行と本文行を列ごとに見られる形にしておく。 */
interface Table {
  head: Cell[];
  /** 本文行。列数が揃っていない表もあるため、行ごとの配列のまま持つ。 */
  body: Cell[][];
}

/**
 * `table_open` から `table_close` までを読み、セルを行ごとに集める。
 *
 * 戻り値の `end` は `table_close` の位置で、呼び出し側が次の表を探す起点になる。
 */
function collect(tokens: Token[], start: number): { table: Table; end: number } {
  const head: Cell[] = [];
  const body: Cell[][] = [];

  let inBody = false;
  let row: Cell[] | null = null;
  let i = start + 1;

  for (; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    if (token.type === 'table_close') break;

    switch (token.type) {
      case 'tbody_open': {
        inBody = true;
        break;
      }
      case 'tr_open': {
        row = [];
        break;
      }
      case 'tr_close': {
        if (inBody && row) body.push(row);
        row = null;
        break;
      }
      case 'th_open':
      case 'td_open': {
        // セルの中身は直後の `inline` トークンが持つ。空のセルでは `inline` の content が空文字になる。
        const text = tokens[i + 1]?.type === 'inline' ? (tokens[i + 1]?.content.trim() ?? '') : '';
        const cell = { token, text };
        if (inBody) row?.push(cell);
        else head.push(cell);
        break;
      }
      default: {
        break;
      }
    }
  }

  return { table: { head, body }, end: i };
}

/**
 * 列が数値だけで出来ているか。
 *
 * 「値が無い」を意味するセル（`NEUTRAL`）は数えない。
 * 1 つも数値が無い列（空欄と `-` だけの列）は数値列にしない。
 */
function isNumericColumn(table: Table, column: number): boolean {
  let numbers = 0;

  for (const row of table.body) {
    const text = row[column]?.text;
    if (text === undefined) continue;
    if (NEUTRAL.has(text.toLowerCase())) continue;
    if (!isNumeric(text)) return false;
    numbers++;
  }

  return numbers > 0;
}

/** 揃えを属性へ移す。`style` は `sanitize.ts` が除去するため、残しても意味がない。 */
function applyAlign(cell: Cell, align: Align): void {
  cell.token.attrSet('data-mx-align', align);
}

/** 列ごとの処理。揃えの指定があればそれを移し、無ければ数値列だけを右寄せにする。 */
function applyColumns(table: Table): void {
  for (const [column, header] of table.head.entries()) {
    const explicit = alignOf(header.token);
    const cells = [header, ...table.body.map((row) => row[column]).filter((cell) => cell !== undefined)];

    if (explicit !== null) {
      for (const cell of cells) applyAlign(cell, explicit);
      continue;
    }

    if (!isNumericColumn(table, column)) continue;

    for (const cell of cells) {
      applyAlign(cell, 'right');
      // 桁を縦に揃えるのは CSS 側（`font-variant-numeric`）の仕事で、ここはその目印を置くだけ。
      cell.token.attrSet('data-mx-num', '');
    }
  }
}

/** `style` を消す。揃え以外の用途で markdown-it が付けることはない。 */
function dropStyle(tokens: Token[], start: number, end: number): void {
  for (let i = start; i <= end; i++) {
    const token = tokens[i];
    if (token && (token.type === 'th_open' || token.type === 'td_open')) {
      const index = token.attrIndex('style');
      if (index >= 0) token.attrs?.splice(index, 1);
    }
  }
}

/** 表の描画を整える（モジュール冒頭を参照）。 */
export function tablePlugin(md: MarkdownIt): void {
  md.core.ruler.push('mx_table', (state: StateCore) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]?.type !== 'table_open') continue;

      const { table, end } = collect(tokens, i);
      applyColumns(table);
      dropStyle(tokens, i, end);

      i = end;
    }

    return true;
  });

  const openRule = md.renderer.rules['table_open'];
  md.renderer.rules['table_open'] = (tokens, idx, options, env, self) => {
    const rendered = openRule ? openRule(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    return `<div class="mx-table">${rendered}`;
  };

  const closeRule = md.renderer.rules['table_close'];
  md.renderer.rules['table_close'] = (tokens, idx, options, env, self) => {
    const rendered = closeRule ? closeRule(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    return `${rendered}</div>\n`;
  };
}
