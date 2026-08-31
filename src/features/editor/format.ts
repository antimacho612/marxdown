/**
 * Markdown の書式コマンド（F-EDIT-08 / `editor` チャンク）。
 *
 * # ここが「Markdown First」の実装
 *
 * 03.ux-spec/04-keybindings.md §1 は、`Ctrl+B` を VS Code のサイドバー切替ではなく
 * **太字**に割り当てると決めている。Design Brief §15 で Markdown First（価値 1 位）が
 * Familiar（価値 6 位）より上位だから、というのがその根拠だった。
 * ここはその決定の実体である。
 *
 * # 押した直後の反応は §5 が決めている
 *
 * ```text
 * 選択なし                    記号だけ入れて、カーソルを中央に置く
 * 選択あり（通常）              選択範囲を囲む
 * 選択あり（既に囲まれている）    外す
 * 複数カーソル                 すべてに適用
 * ```
 *
 * **「囲まれている」は 2 通りある。** 記号ごと選んだ場合（`**word**`）と、
 * 中身だけ選んだ場合（`**word**` の `word`）で、どちらも外せなければ
 * 「押すたびに増える」ことになる。
 *
 * # テキストへ書き戻す経路ではない
 *
 * ここが触るのは **CodeMirror のドキュメント（＝ Markdown テキストそのもの）**であって、
 * AST でも DOM でもない（ADR-0002）。書式コマンドは「ユーザーが手で打つはずだった
 * 文字列を代わりに打つ」だけの操作で、それ以外の場所のバイト列には触れない（N-CMP-03）。
 */
import { EditorSelection, type ChangeSpec, type EditorState, type StateCommand } from '@codemirror/state';

/* ------------------------------------------------------------------ */
/* インラインの囲み（太字 / 斜体 / 取り消し線 / インラインコード）        */
/* ------------------------------------------------------------------ */

interface Wrap {
  /** 挿入・除去する記号。 */
  marker: string;
  /**
   * その位置に**記号があると見なすか**を、記号文字の連続数から判定する。
   *
   * **`*` は太字と斜体で共有されている。** 単純に「`*` で始まるか」で見ると、
   * `**bold**` に斜体を掛けたときに太字の記号を 1 つずつ剥がしてしまう。
   * CommonMark と同じく**連続数**で見分ける。
   *
   * ```text
   * *x*     連続 1 → 斜体
   * **x**   連続 2 → 太字
   * ***x*** 連続 3 → 両方
   * ```
   */
  present: (run: number) => boolean;
}

const BOLD: Wrap = { marker: '**', present: (run) => run >= 2 };
const ITALIC: Wrap = { marker: '*', present: (run) => run % 2 === 1 };
const STRIKETHROUGH: Wrap = { marker: '~~', present: (run) => run >= 2 };
const CODE: Wrap = { marker: '`', present: (run) => run === 1 };

/** `pos` の手前に何文字 `char` が続いているか。 */
function runBefore(state: EditorState, pos: number, char: string, limit: number): number {
  let run = 0;
  while (run < limit && pos > run && state.sliceDoc(pos - run - 1, pos - run) === char) run++;
  return run;
}

/** `pos` の直後に何文字 `char` が続いているか。 */
function runAfter(state: EditorState, pos: number, char: string, limit: number): number {
  let run = 0;
  while (run < limit && pos + run < state.doc.length && state.sliceDoc(pos + run, pos + run + 1) === char) run++;
  return run;
}

/**
 * 囲みをトグルする。
 *
 * **カーソルが語の中にあるだけでは外れない。** `**bo|ld**` で `Ctrl+B` を押すと
 * §5 の「選択なし」に従って記号が挿入される。語の範囲を推測して外すのは
 * 一見親切だが、**どこまでが対象か押す前に読めない**（Principle 3）。
 */
function toggleWrap({ marker, present }: Wrap): StateCommand {
  const char = marker[0] ?? '';
  const width = marker.length;

  return ({ state, dispatch }) => {
    if (state.readOnly) return false;

    const spec = state.changeByRange((range) => {
      const length = range.to - range.from;

      // 1. 記号ごと選んでいる（`**word**` を選択して Ctrl+B）
      if (length >= width * 2) {
        const inner = Math.floor(length / 2);
        const left = runAfter(state, range.from, char, inner);
        const right = runBefore(state, range.to, char, inner);
        if (present(left) && present(right)) {
          return {
            changes: [
              { from: range.from, to: range.from + width },
              { from: range.to - width, to: range.to },
            ],
            range: EditorSelection.range(range.from, range.to - width * 2),
          };
        }
      }

      // 2. 中身だけ選んでいる（`**word**` の `word` を選択して Ctrl+B）
      const outerLeft = runBefore(state, range.from, char, width);
      const outerRight = runAfter(state, range.to, char, width);
      if (present(outerLeft) && present(outerRight) && outerLeft >= width && outerRight >= width) {
        return {
          changes: [
            { from: range.from - width, to: range.from },
            { from: range.to, to: range.to + width },
          ],
          range: EditorSelection.range(range.from - width, range.to - width),
        };
      }

      // 3. 囲む。選択が無ければ記号だけを入れて、あいだにカーソルを置く（§5）
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: range.empty
          ? EditorSelection.cursor(range.from + width)
          : EditorSelection.range(range.from + width, range.to + width),
      };
    });

    dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

export const toggleBold = toggleWrap(BOLD);
export const toggleItalic = toggleWrap(ITALIC);
export const toggleStrikethrough = toggleWrap(STRIKETHROUGH);
export const toggleInlineCode = toggleWrap(CODE);

/* ------------------------------------------------------------------ */
/* リンク                                                              */
/* ------------------------------------------------------------------ */

/**
 * リンクを挿入する（`Ctrl+K` / 03.ux-spec/04-keybindings.md §3）。
 *
 * **選択範囲がリンクテキストになる**（§3 の但し書き）。URL は空で入れて、
 * そこにカーソルを置く。選択が無ければ `[]()` を入れて `[]` の中へ置く。
 * 先に書きたいものが違うので、置く場所も変える。
 *
 * URL を**貼る**ほうは `paste.ts`（F-EDIT-12）。こちらは「いま無い URL を打つ」経路。
 */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;

  const spec = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: `[${text}]()` },
      // 選択あり → `()` の中（URL を打つ） / 選択なし → `[]` の中（文字を打つ）
      range: EditorSelection.cursor(range.from + (range.empty ? 1 : text.length + 3)),
    };
  });

  dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};

/* ------------------------------------------------------------------ */
/* 行の頭に付くもの（見出し / 引用 / リスト）                            */
/* ------------------------------------------------------------------ */

/**
 * 行頭の記法。**タスクリストを箇条書きより先に見る**（`- [ ] ` は `- ` でもある）。
 */
const TASK = /^(\s*)[-*+] +\[[ xX]\] +/;
const BULLET = /^(\s*)[-*+] +/;
const ORDERED = /^(\s*)\d+[.)] +/;
const QUOTE = /^(\s*)> ?/;
const HEADING = /^(\s*)#{1,6} +/;

/** 選択が触れているすべての行。複数カーソルでも 1 行を二度数えない。 */
function selectedLines(state: EditorState): { from: number; to: number; text: string }[] {
  const lines: { from: number; to: number; text: string }[] = [];
  let last = 0;

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const final = state.doc.lineAt(range.to).number;
    for (let n = Math.max(first, last + 1); n <= final; n++) {
      const line = state.doc.line(n);
      lines.push({ from: line.from, to: line.to, text: line.text });
      last = n;
    }
  }

  return lines;
}

/** いま行頭に付いている記法の長さ。無ければ 0。 */
function prefixLength(text: string, pattern: RegExp): number {
  return pattern.exec(text)?.[0].length ?? 0;
}

/**
 * 選択が触れている行を書き換える。
 *
 * `build` は 1 行につき 1 回呼ばれ、**その行に対する変更**を返す。`null` なら変えない。
 * 番号付きリストの連番のために `index` を渡す。
 *
 * # 行まるごとを置き換えてはいけない
 *
 * `{ from: line.from, to: line.to }` で丸ごと差し替えると、**行の中に居た
 * カーソルが行頭へ飛ぶ**（CodeMirror は置換された範囲の中の位置を先頭へ寄せる）。
 * 打っている途中に `Ctrl+Shift+L` を押すと入力位置を見失うことになるので、
 * **変えるのは記法の部分だけ**にして、本文には触らない。
 *
 * 1 行も変わらなければ `false` を返す。**キーを握り潰さない**ためで、
 * 呼び出し側（キーマップ）は次のバインドへ処理を渡せる。
 */
function lineCommand(build: (line: { from: number; text: string }, index: number) => ChangeSpec | null): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false;

    const lines = selectedLines(state);
    const changes: ChangeSpec[] = [];

    for (const [index, line] of lines.entries()) {
      const change = build(line, index);
      if (change !== null) changes.push(change);
    }

    if (changes.length === 0) return false;

    dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

/** 行頭の記法をすべて剥がして、インデントと素の本文に分ける。 */
function stripMarkers(text: string): { indent: string; body: string } {
  const indent = /^[\t ]*/.exec(text)?.[0] ?? '';
  let body = text.slice(indent.length);

  // 引用の中のリスト（`> - a`）のように重なることがあるので、剥がせなくなるまで回す。
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
 * 行頭にひとつだけ付く記法を、**選択全体でひとつの結論**にしてトグルする。
 *
 * 全部が既にその記法なら外し、1 行でも違えば全部に付ける。行ごとにトグルすると、
 * 押した結果が選択の中身に依存して読めなくなる（Principle 3）。
 */
function toggleLinePrefix(pattern: RegExp, prefixOf: (index: number) => string): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false;

    const lines = selectedLines(state);
    if (lines.length === 0) return false;

    // 全部が既にその記法なら外す。1 行でも違えば全部に付ける。
    const remove = lines.every((line) => pattern.test(line.text));
    const changes: ChangeSpec[] = [];

    for (const [index, line] of lines.entries()) {
      const { indent, body } = stripMarkers(line.text);
      // 変えるのは記法の部分（インデント〜本文の手前）だけ。本文には触らない。
      const to = line.from + line.text.length - body.length;
      const insert = remove ? indent : indent + prefixOf(index);
      if (insert === line.text.slice(0, to - line.from)) continue;
      changes.push({ from: line.from, to, insert });
    }

    if (changes.length === 0) return false;

    dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

export const toggleBulletList = toggleLinePrefix(BULLET, () => '- ');

/**
 * 番号付きリストの切替（`Ctrl+Shift+N` / F-EDIT-10）。
 *
 * **選択したぶんだけを 1 から振る。** 続きの行までは触らない。
 * 触れば「編集していない箇所のバイト列が変わる」ことになり、N-CMP-03 に反する。
 * Markdown は `1.` が並んでいても正しく採番して描くので、実害も無い。
 */
export const toggleOrderedList = toggleLinePrefix(ORDERED, (index) => `${index + 1}. `);

export const toggleBlockquote = toggleLinePrefix(QUOTE, () => '> ');

/**
 * 見出しのレベルを設定する（`Ctrl+Alt+1`〜`6` / `Ctrl+Alt+0` で解除）。
 *
 * **1〜6 はトグルではなく設定。** 同じレベルをもう一度押しても見出しのまま。
 * 「`Ctrl+Alt+2` を押したら必ず `##` になる」ほうが、押す前に結果を読める。
 */
export function setHeading(level: number): StateCommand {
  return lineCommand((line) => {
    const { indent, body } = stripMarkers(line.text);
    if (body === '') return null;

    const to = line.from + line.text.length - body.length;
    const insert = level === 0 ? indent : `${indent}${'#'.repeat(level)} `;
    if (insert === line.text.slice(0, to - line.from)) return null;
    return { from: line.from, to, insert };
  });
}

/**
 * タスクリストのチェックを切り替える（`Ctrl+Enter`）。
 *
 * **タスクリストの行でなければ何もしない。** `- ` を勝手に `- [ ] ` へ変えない
 * （押した人が求めているのはチェックの切替であって、リストの種類を変えることではない）。
 */
export const toggleTaskCheck = lineCommand((line) => {
  const matched = /^(\s*[-*+] +\[)([ xX])\] +/.exec(line.text);
  if (!matched) return null;

  // **1 文字だけ差し替える。** チェックの切替で行の他の場所が変わる理由が無い。
  const at = line.from + (matched[1]?.length ?? 0);
  return { from: at, to: at + 1, insert: matched[2] === ' ' ? 'x' : ' ' };
});

/* ------------------------------------------------------------------ */
/* コードブロック                                                       */
/* ------------------------------------------------------------------ */

const FENCE = '```';

/**
 * コードブロックの切替（`` Ctrl+Shift+` ``）。
 *
 * 選択の**前後の行**がフェンスならほどき、そうでなければ囲む。
 * 選択が無ければ空のフェンスを入れて、あいだにカーソルを置く。
 */
export const toggleCodeBlock: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;

  const main = state.selection.main;
  const first = state.doc.lineAt(main.from);
  const last = state.doc.lineAt(main.to);

  // ほどく: 選択の 1 つ外側がフェンスで挟まれている
  const above = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const below = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null;
  if (above?.text.startsWith(FENCE) === true && below?.text.startsWith(FENCE) === true) {
    dispatch(
      state.update({
        changes: [
          { from: above.from, to: first.from },
          { from: last.to, to: below.to },
        ],
        scrollIntoView: true,
        userEvent: 'delete.format',
      }),
    );
    return true;
  }

  // 空行にカーソルを置いただけなら、空のブロックを入れて中へ運ぶ
  if (main.empty && first.text === '') {
    dispatch(
      state.update({
        changes: { from: first.from, insert: `${FENCE}\n\n${FENCE}` },
        selection: EditorSelection.cursor(first.from + FENCE.length + 1),
        scrollIntoView: true,
        userEvent: 'input.format',
      }),
    );
    return true;
  }

  dispatch(
    state.update({
      changes: [
        { from: first.from, insert: `${FENCE}\n` },
        { from: last.to, insert: `\n${FENCE}` },
      ],
      scrollIntoView: true,
      userEvent: 'input.format',
    }),
  );
  return true;
};
