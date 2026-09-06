/**
 * Markdown の書式コマンド（F-EDIT-08 / `editor` チャンク）。
 *
 * `Ctrl+B` を VS Code のサイドバー切替ではなく太字に割り当てる決定の実体である（Markdown First が Familiar より優先順位が高いため / 03.ux-spec/04-keybindings.md §1）。
 * 押した反応は §5 が定める（選択なしは記号だけ挿入、選択ありは囲む、既に囲まれていれば外す、複数カーソルは全てに適用）。
 * 「囲まれている」は記号ごと選んだ場合と中身だけ選んだ場合の 2 通りがあり、どちらも外せないと押すたびに記号が増えてしまう。
 *
 * 触るのは Monaco のモデル（＝ Markdown テキストそのもの）で AST でも DOM でもない（ADR-0002）。
 * ユーザーが手で打つはずだった文字列を代わりに打つだけで、それ以外のバイト列には触れない（N-CMP-03）。
 */
import { byRange, lineInfo, offsetRange, offsetsOf, selectedLines, textAt, type MarkdownEdit } from './edits';
import type { monaco } from './monaco';

interface Wrap {
  /** 挿入・除去する記号。 */
  marker: string;
  /**
   * その位置に記号があると見なすかを、記号文字の連続数から判定する。
   *
   * `*` は太字と斜体で共有されている。
   * 単純に「`*` で始まるか」で見ると、`**bold**` に斜体を掛けたときに太字の記号を 1 つずつ剥がしてしまうため、CommonMark と同じく連続数（1 なら斜体、2 なら太字、3 なら両方）で見分ける。
   */
  present: (run: number) => boolean;
}

const BOLD: Wrap = { marker: '**', present: (run) => run >= 2 };
const ITALIC: Wrap = { marker: '*', present: (run) => run % 2 === 1 };
const STRIKETHROUGH: Wrap = { marker: '~~', present: (run) => run >= 2 };
const CODE: Wrap = { marker: '`', present: (run) => run === 1 };

/** `pos` の手前に何文字 `char` が続いているか。 */
function runBefore(model: monaco.editor.ITextModel, pos: number, char: string, limit: number): number {
  const text = textAt(model, pos - limit, pos);
  let run = 0;
  while (run < text.length && text.at(-1 - run) === char) run++;
  return run;
}

/** `pos` の直後に何文字 `char` が続いているか。 */
function runAfter(model: monaco.editor.ITextModel, pos: number, char: string, limit: number): number {
  const text = textAt(model, pos, pos + limit);
  let run = 0;
  while (run < text.length && text[run] === char) run++;
  return run;
}

/**
 * 囲みをトグルする。
 *
 * カーソルが語の内側にあるだけでは記号を除去しない。
 * `**bo|ld**` で `Ctrl+B` を押した場合は §5 の「選択なし」に従って記号を挿入する。
 * 語の範囲を推測して除去する方式は、操作前に対象範囲を判断できない（Principle 3）。
 */
function toggleWrap({ marker, present }: Wrap): MarkdownEdit {
  const char = marker[0] ?? '';
  const width = marker.length;

  return (model, selections) =>
    byRange(model, selections, ({ from, to, empty }) => {
      const length = to - from;

      // 1. 記号ごと選んでいる（`**word**` を選択して Ctrl+B）
      if (length >= width * 2) {
        const inner = Math.floor(length / 2);
        const left = runAfter(model, from, char, inner);
        const right = runBefore(model, to, char, inner);
        if (present(left) && present(right)) {
          return {
            edits: [
              { from, to: from + width, text: '' },
              { from: to - width, to, text: '' },
            ],
            select: { from, to: to - width * 2 },
          };
        }
      }

      // 2. 中身だけ選んでいる（`**word**` の `word` を選択して Ctrl+B）
      const outerLeft = runBefore(model, from, char, width);
      const outerRight = runAfter(model, to, char, width);
      if (present(outerLeft) && present(outerRight) && outerLeft >= width && outerRight >= width) {
        return {
          edits: [
            { from: from - width, to: from, text: '' },
            { from: to, to: to + width, text: '' },
          ],
          select: { from: from - width, to: to - width },
        };
      }

      // 3. 囲む。選択が無ければ記号だけを入れて、あいだにカーソルを置く（§5）
      return {
        edits: [
          { from, to: from, text: marker },
          { from: to, to, text: marker },
        ],
        select: empty ? { from: from + width, to: from + width } : { from: from + width, to: to + width },
      };
    });
}

/** 囲み記法のトグル（F-EDIT-08 / `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+X` / `` Ctrl+` ``）。 */
export const toggleBold = toggleWrap(BOLD);
export const toggleItalic = toggleWrap(ITALIC);
export const toggleStrikethrough = toggleWrap(STRIKETHROUGH);
export const toggleInlineCode = toggleWrap(CODE);

/**
 * リンクを挿入する（`Ctrl+K` / 03.ux-spec/04-keybindings.md §3）。
 *
 * 選択範囲がリンクテキストになる（§3 の但し書き）。
 * URL は空のまま挿入し、そこへカーソルを置く。
 * 選択が無い場合は `[]()` を挿入し、`[]` の中へカーソルを置く。
 * 次に入力する対象が異なるため、カーソルの位置も変える。
 *
 * URL の貼り付けは `paste.ts` が担当する（F-EDIT-12）。こちらは URL を入力する経路である。
 */
export const insertLink: MarkdownEdit = (model, selections) =>
  byRange(model, selections, ({ from, to, empty }) => {
    const text = textAt(model, from, to);
    const at = from + (empty ? 1 : text.length + 3);
    return {
      edits: [{ from, to, text: `[${text}]()` }],
      // 選択あり → `()` の中（URL を打つ） / 選択なし → `[]` の中（文字を打つ）
      select: { from: at, to: at },
    };
  });

/**
 * 行頭の記法。タスクリストを箇条書きより先に判定する（`- [ ] ` は `- ` にも一致するため）。
 */
const TASK = /^(\s*)[-*+] +\[[ xX]\] +/;
const BULLET = /^(\s*)[-*+] +/;
const ORDERED = /^(\s*)\d+[.)] +/;
const QUOTE = /^(\s*)> ?/;
const HEADING = /^(\s*)#{1,6} +/;

/** いま行頭に付いている記法の長さ。無ければ 0。 */
function prefixLength(text: string, pattern: RegExp): number {
  return pattern.exec(text)?.[0].length ?? 0;
}

/**
 * 選択が触れている行を書き換える。
 *
 * `build` は 1 行につき 1 回呼ばれ、その行に対する変更（`null` なら変えない）を返す。
 * 番号付きリストの連番のために `index` を渡す。
 *
 * 行を丸ごと差し替えるとカーソルが行頭へ飛び入力位置を見失うため、変えるのは記法の部分だけにして本文には触らない。
 * 選択範囲は指定せず Monaco に編集を通して移動させることで、記法だけを触っているかぎりカーソルは同じ場所に残る。
 *
 * 1 行も変わらなければ `null` を返す。
 * キーの既定動作を止めないためであり、呼び出し側（キーマップ）が既定の動作へ処理を渡せる。
 */
function lineCommand(
  build: (line: { from: number; text: string }, index: number) => { from: number; to: number; text: string } | null,
): MarkdownEdit {
  return (model, selections) => {
    const lines = selectedLines(model, selections);
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];

    for (const [index, line] of lines.entries()) {
      const change = build(line, index);
      if (change !== null) edits.push({ range: offsetRange(model, change.from, change.to), text: change.text });
    }

    if (edits.length === 0) return null;
    return { edits };
  };
}

/** 行頭の記法をすべて剥がして、インデントと素の本文に分ける。 */
function stripMarkers(text: string): { indent: string; body: string } {
  const indent = /^[\t ]*/.exec(text)?.[0] ?? '';
  let body = text.slice(indent.length);

  // 引用の中のリスト（`> - a`）のように記法が重なることがあるため、除去できなくなるまで繰り返す。
  for (;;) {
    let length = 0;
    for (const pattern of [TASK, BULLET, ORDERED, QUOTE, HEADING]) {
      length = Math.max(length, prefixLength(body, pattern));
    }
    if (length === 0) break;
    body = body.slice(length);
  }

  return { indent, body };
}

/**
 * 行頭に 1 つだけ付く記法を、選択範囲全体で 1 つの結果になるようトグルする。
 *
 * すべてが既にその記法なら除去し、1 行でも異なれば全体に付与する。
 * 行ごとにトグルすると、操作の結果が選択範囲の内容に依存して予測できなくなる（Principle 3）。
 */
function toggleLinePrefix(pattern: RegExp, prefixOf: (index: number) => string): MarkdownEdit {
  return (model, selections) => {
    const lines = selectedLines(model, selections);
    if (lines.length === 0) return null;

    // 全部が既にその記法なら外す。1 行でも違えば全部に付ける。
    const remove = lines.every((line) => pattern.test(line.text));
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];

    for (const [index, line] of lines.entries()) {
      const { indent, body } = stripMarkers(line.text);
      // 変更するのは記法の部分（インデントから本文の手前まで）だけで、本文は変更しない。
      const to = line.from + line.text.length - body.length;
      const insert = remove ? indent : indent + prefixOf(index);
      if (insert === line.text.slice(0, to - line.from)) continue;
      edits.push({ range: offsetRange(model, line.from, to), text: insert });
    }

    if (edits.length === 0) return null;
    return { edits };
  };
}

/** 箇条書きの切替（`Ctrl+Shift+L` / F-EDIT-09）。 */
export const toggleBulletList = toggleLinePrefix(BULLET, () => '- ');

/**
 * 番号付きリストの切替（`Ctrl+Shift+N` / F-EDIT-10）。
 *
 * 採番するのは選択した範囲だけで、後続の行は変更しない。
 * 変更すると編集していない箇所のバイト列が変わることになり、N-CMP-03 に反する。
 * Markdown は `1.` が並んでいても正しく採番して描画するため、影響もない。
 */
export const toggleOrderedList = toggleLinePrefix(ORDERED, (index) => `${index + 1}. `);

/** 引用の切替（`Ctrl+Shift+.`）。 */
export const toggleBlockquote = toggleLinePrefix(QUOTE, () => '> ');

/**
 * 見出しのレベルを設定する（`Ctrl+Alt+1`〜`6` / `Ctrl+Alt+0` で解除）。
 *
 * 1〜6 はトグルではなくレベルの設定である。同じレベルをもう一度押しても見出しのままにする。
 * `Ctrl+Alt+2` を押せば必ず `##` になるほうが、操作前に結果を判断できる。
 */
export function setHeading(level: number): MarkdownEdit {
  return lineCommand((line) => {
    const { indent, body } = stripMarkers(line.text);
    if (body === '') return null;

    const to = line.from + line.text.length - body.length;
    const insert = level === 0 ? indent : `${indent}${'#'.repeat(level)} `;
    if (insert === line.text.slice(0, to - line.from)) return null;
    return { from: line.from, to, text: insert };
  });
}

/**
 * タスクリストのチェックを切り替える（`Ctrl+Enter`）。
 *
 * タスクリストの行でなければ何もしない。
 * `- ` を `- [ ] ` へは変換しない（この操作が求めているのはチェックの切り替えであり、リストの種類の変更ではない）。
 */
export const toggleTaskCheck = lineCommand((line) => {
  const matched = /^(\s*[-*+] +\[)([ xX])\] +/.exec(line.text);
  if (!matched) return null;

  // 差し替えるのは 1 文字だけにする。チェックの切り替えで行の他の箇所を変更する必要はない。
  const at = line.from + (matched[1]?.length ?? 0);
  return { from: at, to: at + 1, text: matched[2] === ' ' ? 'x' : ' ' };
});

const FENCE = '```';

/**
 * コードブロックの切替（`` Ctrl+Shift+` ``）。
 *
 * 選択範囲の前後の行がフェンスならそれを除去し、そうでなければフェンスで囲む。
 * 選択が無ければ空のフェンスを挿入し、その内側へカーソルを置く。
 */
export const toggleCodeBlock: MarkdownEdit = (model, selections) => {
  const main = selections[0];
  if (!main) return null;

  const { from, to, empty } = offsetsOf(model, main);
  const first = lineInfo(model, main.startLineNumber);
  const last = lineInfo(model, main.endLineNumber);
  const lastEnd = last.from + last.text.length;

  // 除去する場合: 選択範囲の 1 つ外側がフェンスで挟まれている
  const above = first.number > 1 ? lineInfo(model, first.number - 1) : null;
  const below = last.number < model.getLineCount() ? lineInfo(model, last.number + 1) : null;
  if (above?.text.startsWith(FENCE) === true && below?.text.startsWith(FENCE) === true) {
    return {
      edits: [
        { range: offsetRange(model, above.from, first.from), text: '' },
        { range: offsetRange(model, lastEnd, below.from + below.text.length), text: '' },
      ],
    };
  }

  // 空行にカーソルを置いただけなら、空のブロックを入れて中へ運ぶ
  if (empty && first.text === '') {
    const at = first.from + FENCE.length + 1;
    return {
      edits: [{ range: offsetRange(model, first.from, first.from), text: `${FENCE}\n\n${FENCE}` }],
      selectionOffsets: [{ from: at, to: at }],
    };
  }

  return {
    edits: [
      { range: offsetRange(model, first.from, first.from), text: `${FENCE}\n` },
      { range: offsetRange(model, lastEnd, lastEnd), text: `\n${FENCE}` },
    ],
    // 囲んだぶん、選択は 1 行ぶん（フェンスと改行）だけ後ろへ動く。
    selectionOffsets: [{ from: from + FENCE.length + 1, to: to + FENCE.length + 1 }],
  };
};
