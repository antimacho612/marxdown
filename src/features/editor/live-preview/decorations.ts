/**
 * Live Preview の装飾（02.architecture/07-editor-wysiwyg.md §2 / ADR-0002）。
 *
 * **見出しと強調だけ**を実装した骨格。全記法を書くのは M5 の担当で、
 * ここは方式が成立することを確かめ、拡張の型を示すためのもの。
 *
 * # 中核の UX
 *
 * 「カーソルがある行では記法を表示する」（Obsidian の Live Preview と同じ）。
 * これにより「見た目通りに読める」と「Markdown を直接編集できる」が両立する。
 *
 * # 記法を足すときに見る論点
 *
 * 1. Lezer の構文木を走査して Decoration を当てる
 * 2. カーソル行だけ記法を復活させる
 * 3. `Decoration.replace` で記号を隠したときの選択・カーソル移動の挙動
 *    （`EditorView.atomicRanges` を併せて提供する）
 * 4. IME 入力中に装飾が暴れないか（M5 の最大リスク・完了条件）
 */
import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/** 見出しレベルごとの行装飾。実サイズはテーマ側で決める。 */
const HEADING_LINE = [1, 2, 3, 4, 5, 6].map((level) => Decoration.line({ class: `cm-mx-heading cm-mx-h${level}` }));

const STRONG_MARK = Decoration.mark({ class: 'cm-mx-strong' });
const EM_MARK = Decoration.mark({ class: 'cm-mx-em' });
/** 記法そのものを隠す。`replace` なので幅ゼロになる。 */
const HIDE = Decoration.replace({});

/* ------------------------------------------------------------------ */
/* IME 変換中の抑制                                                    */
/* ------------------------------------------------------------------ */

const setComposing = StateEffect.define<boolean>();

/**
 * IME 変換中は装飾を更新しない。
 *
 * 変換中の未確定文字列に対して Decoration を差し替えると、
 * WebView が composition を中断することがある。**これが WYSIWYG の最大のリスク**であり、
 * 実際の IME で破綻しないかは実機で触るまで判定できない（ADR-0002）。
 */
const composingField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setComposing)) return effect.value;
    }
    return value;
  },
});

const compositionTracker = EditorView.domEventHandlers({
  compositionstart(_event, view) {
    view.dispatch({ effects: setComposing.of(true) });
    return false;
  },
  compositionend(_event, view) {
    // compositionend の直後はまだ確定テキストが反映されていないことがある。
    // 次のフレームで解除して、装飾の再計算を確定後に回す。
    requestAnimationFrame(() => {
      view.dispatch({ effects: setComposing.of(false) });
    });
    return false;
  },
});

/* ------------------------------------------------------------------ */
/* 装飾の構築                                                          */
/* ------------------------------------------------------------------ */

/** カーソル（と選択範囲の端）がある行の集合。ここでは記法を隠さない。 */
function revealedLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    lines.add(view.state.doc.lineAt(range.head).number);
    if (!range.empty) lines.add(view.state.doc.lineAt(range.anchor).number);
  }
  return lines;
}

/**
 * 行装飾（見出し）とマーク装飾（強調・記号の非表示）を 1 本の DecorationSet にまとめる。
 *
 * CodeMirror は line と mark を同じセットに入れられる。必要なのは
 * **from の昇順に並んでいること**だけ。`Decoration.set(ranges, true)` の
 * 第 2 引数がソートを引き受ける。
 */
function build(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const revealed = revealedLines(view);
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const headingMatch = /^ATXHeading([1-6])$/.exec(node.name);
        if (headingMatch?.[1]) {
          const line = view.state.doc.lineAt(node.from);
          if (!seenLines.has(line.number)) {
            seenLines.add(line.number);
            const deco = HEADING_LINE[Number(headingMatch[1]) - 1];
            if (deco) ranges.push(deco.range(line.from));
          }
          return;
        }

        // `#` の記号。カーソル行でなければ、続く空白ごと隠す。
        // 空白を残すと本文が 1 文字ぶん右にずれて、見出しの左端が揃わない。
        if (node.name === 'HeaderMark') {
          const line = view.state.doc.lineAt(node.from);
          if (revealed.has(line.number)) return;
          const next = view.state.doc.sliceString(node.to, node.to + 1);
          const end = next === ' ' ? node.to + 1 : node.to;
          if (end > node.from) ranges.push(HIDE.range(node.from, end));
          return;
        }

        if (node.name === 'StrongEmphasis') {
          ranges.push(STRONG_MARK.range(node.from, node.to));
          return;
        }
        if (node.name === 'Emphasis') {
          ranges.push(EM_MARK.range(node.from, node.to));
          return;
        }
        if (node.name === 'EmphasisMark') {
          const line = view.state.doc.lineAt(node.from);
          if (!revealed.has(line.number)) ranges.push(HIDE.range(node.from, node.to));
        }
      },
    });
  }

  return Decoration.set(ranges, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = build(view);
    }

    update(update: ViewUpdate) {
      // IME 変換中は一切触らない
      if (update.state.field(composingField, false) === true) return;
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = build(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    // 記号を隠した範囲にカーソルが入ったときのために、
    // atomicRanges を提供して矢印キーが「中に入らない」ようにする。
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

export const livePreviewTheme = EditorView.theme({
  '.cm-mx-heading': { fontWeight: '650', lineHeight: '1.35' },
  '.cm-mx-h1': { fontSize: '1.8em' },
  '.cm-mx-h2': { fontSize: '1.45em' },
  '.cm-mx-h3': { fontSize: '1.2em' },
  '.cm-mx-h4': { fontSize: '1.05em' },
  '.cm-mx-h5': { fontSize: '1em' },
  '.cm-mx-h6': { fontSize: '1em', color: 'var(--mx-color-fg-muted)' },
  '.cm-mx-strong': { fontWeight: '700' },
  '.cm-mx-em': { fontStyle: 'italic' },
});

export function livePreview(): Extension {
  return [composingField, compositionTracker, livePreviewPlugin, livePreviewTheme];
}
