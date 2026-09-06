/**
 * Split のスクロール同期と双方向ジャンプ（F-MODE-05 / 03.ux-spec/03-split-mode.md §2, §3）。
 *
 * プレビューのブロック要素には `data-line` が付いており（`markdown/plugins/line-map.ts`）、エディターも行番号を持つため、両者を結ぶのは行番号だけでよい。
 * このモジュールは `main` チャンクにいるためエディターを直接 import せず、行番号だけの窓口 `EditorScrollPort` を受け取る（座標計算はエンジン固有の `features/editor/lazy/scroll-port.ts` 側に置く）。
 * 行あたりの高さが要素ごとに違うため、`data-line` を持つ要素の間を線形補間する（§3）。
 *
 * 片方を動かすと相手の `scroll` が飛んでまた動くという循環が起きるため、これを防ぐために主導権は最後に操作した側が持ち、動かされた側からの同期を短時間停止する（§2）。
 */
import { viewStore } from './store.svelte';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * エディター側の窓口。実装は `features/editor/lazy/scroll-port.ts`（`editor` チャンク）。
 *
 * **やり取りするのは行番号だけ。** 行番号は 1 始まりで、**端数を含む**
 * （`3.5` は 3 行目の高さの半分まで隠れている状態）。
 * 行あたりの高さが一定でない以上、整数に丸めると 1 行ぶんの跳ねが出る。
 *
 * 範囲外の行番号は**実装側が丸める**。呼び出し側が行数を知る必要は無い。
 */
export interface EditorScrollPort {
  /** ビューポート最上部に来ている行番号。 */
  topLine(): number;
  /** その行がビューポート最上部に来る位置へ動かす。カーソルは動かさない。 */
  scrollToLine(line: number): void;
  /** カーソルをその行の先頭へ置き、見える位置まで運ぶ。 */
  revealLine(line: number, options?: { focus?: boolean }): void;
  /** スクロールを購読する。**解除する関数を返す。** */
  onScroll(listener: () => void): () => void;
}

/**
 * 動かされた側を黙らせておく時間。
 *
 * 短すぎると循環的な同期が起き、長すぎると「反対側を触ってもすぐ効かない」。
 * 慣性スクロールが落ち着くまでの実測（Windows のホイール）に合わせてある。
 */
const SUPPRESS_MS = 120;

/** 行番号と、プレビュー上でのその行の位置。 */
interface Anchor {
  line: number;
  top: number;
}

interface Sync {
  preview: HTMLElement;
  dispose: () => void;
}

let active: Sync | null = null;

/**
 * エディター側の窓口。載っているあいだずっと在る（スクロール同期の在り無しとは別）。
 *
 * 以前はここが `active`（Split のあいだだけ在るもの）の中に居たため、Edit ではジャンプの飛び先が無くアウトラインの見出しを押しても何も起きなかった（#59）。
 * 同期とジャンプは別の機能で、ジャンプはエディターが載っていれば成立する。
 *
 * 登録するのは `mountEditor`、外すのはエディターを破棄するとき（M3 / N-PERF-06）。
 */
let port: EditorScrollPort | null = null;

/**
 * エディターが自分の窓口を登録する口（`features/editor/lazy/editor.ts` が呼ぶ）。
 * 破棄するときに `null` を渡す。
 */
export function attachEditorScrollPort(next: EditorScrollPort | null): void {
  port = next;
  // 窓口が無くなったのに購読だけ残ると、動かせない相手を呼び続けることになる。
  if (next === null) stopScrollSync();
}

/** どちら側が主導しているか。`null` は「どちらでもない（受け付ける）」。 */
let leader: 'editor' | 'preview' | null = null;
let leaderUntil = 0;

/**
 * 同期を始める。**Split に入ったときに呼ぶ。**
 *
 * 2 回目以降は何もしない。抜けるときは `stopScrollSync`。
 * 窓口（`attachEditorScrollPort`）が登録されていなければ何もしない。
 */
export function startScrollSync(): void {
  if (active) return;

  const target = port;
  const preview = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!target || !preview) return;

  const offEditorScroll = target.onScroll(() => {
    if (!take('editor')) return;
    syncPreviewToEditor(target, preview);
  });

  const onPreviewScroll = (): void => {
    if (!take('preview')) return;
    syncEditorToPreview(target, preview);
  };

  // プレビューの要素をダブルクリック → エディターの該当行へ（§3）。
  // **Split のあいだだけ効く。** Preview だけで読んでいるときは飛ぶ先が無い。
  const onPreviewDoubleClick = (event: MouseEvent): void => {
    const line = lineAtEvent(event);
    if (line === null) return;
    jumpToEditorLine(line);
  };

  preview.addEventListener('scroll', onPreviewScroll, { passive: true });
  preview.addEventListener('dblclick', onPreviewDoubleClick);

  active = {
    preview,
    dispose: () => {
      offEditorScroll();
      preview.removeEventListener('scroll', onPreviewScroll);
      preview.removeEventListener('dblclick', onPreviewDoubleClick);
    },
  };
}

/** 同期をやめる。**Split を抜けたときに呼ぶ。** */
export function stopScrollSync(): void {
  active?.dispose();
  active = null;
  leader = null;
  leaderUntil = 0;
}

/**
 * その側が主導してよいか。
 *
 * 反対側が主導している間は false。
 * 動かされた側の `scroll` をそこで止めることで、循環を断つ。
 *
 * 同期が OFF（`viewStore.scrollSync`）なら常に false。§2 のとおり、
 * OFF でもジャンプ（明示的な操作）は効く — あちらはこの関数を通らない。
 */
function take(side: 'editor' | 'preview'): boolean {
  if (!viewStore.scrollSync) return false;

  const now = performance.now();
  if (leader !== null && leader !== side && now < leaderUntil) return false;

  leader = side;
  leaderUntil = now + SUPPRESS_MS;
  return true;
}

/* ------------------------------------------------------------------ */
/* 対応付け                                                            */
/* ------------------------------------------------------------------ */

/**
 * プレビューの `data-line` を、行番号の昇順に並べた表にする。
 *
 * **毎回組み直す。** 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）で本文は後からも増えるので、
 * 作り置きすると増えたぶんを取りこぼす。`readme.md` で数百件、`huge.md` で
 * 数千件の `querySelectorAll` であり、スクロール 1 回のコストとして許容できる。
 */
function anchorsOf(preview: HTMLElement): Anchor[] {
  const anchors: Anchor[] = [];
  const base = preview.getBoundingClientRect().top - preview.scrollTop;

  for (const element of preview.querySelectorAll<HTMLElement>('[data-line]')) {
    const line = Number(element.dataset['line']);
    if (!Number.isFinite(line)) continue;
    const top = element.getBoundingClientRect().top - base;
    // 行番号は 0 始まり（markdown-it の `token.map`）。エディターは 1 始まり。
    anchors.push({ line: line + 1, top });
  }

  return anchors;
}

/**
 * 行番号 `line` に対応するプレビュー上の位置を、前後のアンカーから補間する。
 *
 * アンカーが 1 つも無い（本文が空 / まだ描かれていない）場合は `null`。
 */
function topForLine(anchors: Anchor[], line: number): number | null {
  if (anchors.length === 0) return null;

  const first = anchors[0];
  if (!first || line <= first.line) return 0;

  for (let i = 1; i < anchors.length; i++) {
    const next = anchors[i];
    const previous = anchors[i - 1];
    if (!next || !previous) continue;
    if (line >= next.line) continue;

    const span = next.line - previous.line;
    if (span <= 0) return previous.top;
    return previous.top + ((next.top - previous.top) * (line - previous.line)) / span;
  }

  return anchors.at(-1)?.top ?? null;
}

/** プレビュー上の位置 `top` に対応する行番号を、前後のアンカーから補間する。 */
function lineForTop(anchors: Anchor[], top: number): number | null {
  if (anchors.length === 0) return null;

  const first = anchors[0];
  if (!first || top <= first.top) return first?.line ?? null;

  for (let i = 1; i < anchors.length; i++) {
    const next = anchors[i];
    const previous = anchors[i - 1];
    if (!next || !previous) continue;
    if (top >= next.top) continue;

    const span = next.top - previous.top;
    if (span <= 0) return previous.line;
    return previous.line + ((next.line - previous.line) * (top - previous.top)) / span;
  }

  return anchors.at(-1)?.line ?? null;
}

/* ------------------------------------------------------------------ */
/* 同期                                                                */
/* ------------------------------------------------------------------ */

function syncPreviewToEditor(port: EditorScrollPort, preview: HTMLElement): void {
  const top = topForLine(anchorsOf(preview), port.topLine());
  if (top === null) return;
  preview.scrollTop = top;
}

function syncEditorToPreview(port: EditorScrollPort, preview: HTMLElement): void {
  const line = lineForTop(anchorsOf(preview), preview.scrollTop);
  if (line === null) return;
  port.scrollToLine(line);
}

/* ------------------------------------------------------------------ */
/* 双方向ジャンプ（§3）                                                 */
/* ------------------------------------------------------------------ */

/**
 * 押された場所の行番号。`data-line` を持つ祖先を辿って探す。
 *
 * **インライン要素には `data-line` が無い**（数が爆発するので付けていない /
 * `markdown/plugins/line-map.ts`）。段落の中の `<code>` を叩いても、
 * 段落の行番号が返る。
 */
function lineAtEvent(event: MouseEvent): number | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  const element = target.closest<HTMLElement>('[data-line]');
  if (!element) return null;

  const line = Number(element.dataset['line']);
  return Number.isFinite(line) ? line + 1 : null;
}

/**
 * プレビューの位置からエディターの行へ飛ぶ（プレビューのダブルクリック / §3）。
 *
 * **同期が OFF でも、Split で無くても効く。** §2 の但し書きどおり、これは
 * 明示的な操作である。アウトラインからのジャンプ（`features/outline/jump.ts`）は
 * Edit でも同じ経路を通るので、**必要なのはエディターが載っていることだけ**。
 * 飛んだあとはエディターが主導権を持つ（そのまま打ち始められる）。
 */
export function jumpToEditorLine(line: number, options: { focus?: boolean } = {}): void {
  if (!port) return;

  leader = 'editor';
  leaderUntil = performance.now() + SUPPRESS_MS;

  // **フォーカスは呼び出し側が決める。** プレビューを叩いたなら移すのが自然だが、
  // アウトラインを叩いたのにエディターへ飛ばされると、続けて次の見出しを選べない。
  port.revealLine(line, { focus: options.focus !== false });
}

/**
 * エディターの行からプレビューの位置へ飛ぶ（アウトラインからのジャンプ / §3）。
 *
 * 同期が OFF でも効く理由は上と同じ。
 */
export function jumpToPreviewLine(line: number): void {
  const preview = active?.preview;
  if (!preview) return;

  const top = topForLine(anchorsOf(preview), line);
  if (top === null) return;

  leader = 'preview';
  leaderUntil = performance.now() + SUPPRESS_MS;
  preview.scrollTop = top;
}

/** Split で同期が動いているか。ジャンプの呼び出し側が「両方へ飛ばすか」を決めるのに使う。 */
export function isScrollSyncActive(): boolean {
  return active !== null;
}

/** テスト用。 */
export const internals = { anchorsOf, lineForTop, topForLine };
