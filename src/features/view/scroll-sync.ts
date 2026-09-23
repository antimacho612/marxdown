/**
 * Split のスクロール同期と双方向ジャンプ（F-MODE-05 / 03.ux-spec/03-split-mode.md §2, §3）。
 *
 * プレビューのブロック要素には `data-line` が付いており（`markdown/plugins/line-map.ts`）、エディターも行番号を持つため、両者を結ぶのは行番号だけでよい。
 * このモジュールは `main` チャンクにあるためエディターを直接 import せず、行番号だけを扱うインタフェース `EditorScrollPort` を受け取る（座標計算はエンジン固有の `features/editor/lazy/scroll-port.ts` に置く）。
 * 行あたりの高さが要素ごとに違うため、`data-line` を持つ要素の間を線形補間する（§3）。
 *
 * 片方を動かすと相手の `scroll` が発火してまた動くという循環が起きるため、これを防ぐために主導権は最後に操作した側が持ち、動かされた側からの同期を短時間停止する（§2）。
 */
import { viewStore } from './store.svelte';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * エディター側のインタフェース。実装は `features/editor/lazy/scroll-port.ts`（`editor` チャンク）にある。
 *
 * やり取りするのは行番号だけである。
 * 行番号は 1 始まりで端数を含む（`3.5` は 3 行目の高さの半分まで隠れている状態を表す）。
 * 行あたりの高さが一定でないため、整数に丸めると 1 行ぶんのずれが生じる。
 *
 * 範囲外の行番号は実装側が丸める。呼び出し側が行数を知る必要はない。
 */
export interface EditorScrollPort {
  /** ビューポート最上部に来ている行番号。 */
  topLine(): number;
  /** その行がビューポート最上部に来る位置へ動かす。カーソルは動かさない。 */
  scrollToLine(line: number): void;
  /** カーソルをその行の先頭へ置き、見える位置まで運ぶ。 */
  revealLine(line: number, options?: { focus?: boolean }): void;
  /** スクロールを購読する。解除する関数を返す。 */
  onScroll(listener: () => void): () => void;
}

/**
 * 動かされた側からの同期を止めておく時間。
 *
 * 短すぎると循環的な同期が発生し、長すぎると反対側を操作しても即座に反映されない。
 * 慣性スクロールが停止するまでの実測値（Windows のホイール）に合わせてある。
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
 * エディター側のインタフェース。マウントされている間は常に保持する（スクロール同期の有無とは別に管理する）。
 *
 * 同期とジャンプは別の機能で、ジャンプはエディターがマウントされていれば成立する。
 *
 * 登録するのは `mountEditor` である。
 */
let port: EditorScrollPort | null = null;

/**
 * エディターが自分のインタフェースを登録する（`features/editor/lazy/editor.ts` が呼ぶ）。
 * 破棄するときは `null` を渡す。
 */
export function attachEditorScrollPort(next: EditorScrollPort | null): void {
  port = next;
  // インタフェースが解除されたのに購読だけ残ると、操作できない相手を呼び続けることになる。
  if (next === null) stopScrollSync();
}

/** どちら側が主導しているか。`null` はどちらも主導しておらず、両側からの同期を受け付ける状態を表す。 */
let leader: 'editor' | 'preview' | null = null;
let leaderUntil = 0;

/**
 * 主導権をエディター側へ移し、プレビューからの同期を短時間止める。
 *
 * プレビューを機械的に動かす側が、その `scroll` で主導権を奪われないために呼ぶ。
 * 再描画でスクロール位置を再設定する動き（`document/live.ts`）は利用者の操作ではなく、主導しているのは打鍵しているエディターである。
 */
export function takeEditorLead(): void {
  leader = 'editor';
  leaderUntil = performance.now() + SUPPRESS_MS;
}

/**
 * 同期を開始する。Split に入ったときに呼ぶ。
 *
 * 2 回目以降は何もしない。終了するときは `stopScrollSync` を呼ぶ。
 * インタフェース（`attachEditorScrollPort`）が登録されていなければ何もしない。
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
  // Split のときだけ動作する。Preview だけで表示しているときは移動先が存在しない。
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

/** 同期を停止する。Split を抜けたときに呼ぶ。 */
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
 * 同期が OFF（`viewStore.scrollSync`）なら常に false。§2 のとおり、OFF でもジャンプ（明示的な操作）は有効であり、ジャンプはこの関数を通らない。
 */
function take(side: 'editor' | 'preview'): boolean {
  if (!viewStore.scrollSync) return false;

  const now = performance.now();
  if (leader !== null && leader !== side && now < leaderUntil) return false;

  leader = side;
  leaderUntil = now + SUPPRESS_MS;
  return true;
}

/**
 * プレビューの `data-line` を、行番号の昇順に並べた表にする。
 *
 * 呼ばれるたびに組み立て直す。
 * 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）では本文が後から追加されるため、事前に構築しておくと追加分を検出できない。
 * `readme.md` で数百件、`huge.md` で数千件の `querySelectorAll` であり、スクロール 1 回あたりのコストとして許容できる。
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
 * アンカーが 1 つも無い（本文が空 / まだ描画されていない）場合は `null`。
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

/**
 * 押された場所の行番号。`data-line` を持つ祖先を辿って探す。
 *
 * インライン要素には `data-line` を付けていない（要素数が過大になるため / `markdown/plugins/line-map.ts`）。
 * 段落の中の `<code>` をクリックした場合も、段落の行番号が返る。
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
 * プレビューの位置からエディターの行へ移動する（プレビューのダブルクリック / §3）。
 *
 * 同期が無効でも、Split でなくても動作する。
 * §2 の但し書きのとおり、これは明示的な操作である。
 * アウトラインからのジャンプ（`features/outline/jump.ts`）は Edit でも同じ経路を通るため、条件はエディターがマウントされていることだけである。
 * 移動後はエディターが主導権を持つ（そのまま入力を続けられる）。
 */
export function jumpToEditorLine(line: number, options: { focus?: boolean } = {}): void {
  if (!port) return;

  takeEditorLead();

  // フォーカスの移動は呼び出し側が決める。
  // プレビューをクリックした場合は移すのが自然だが、アウトラインをクリックしたときにエディターへフォーカスが移ると、続けて次の見出しを選べなくなる。
  port.revealLine(line, { focus: options.focus !== false });
}

/**
 * エディターの行からプレビューの位置へ移動する（アウトラインからのジャンプ / §3）。
 *
 * 同期が OFF でも有効な理由は上と同じ。
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

/** Split で同期が動作しているか。ジャンプの呼び出し側が両方へ移動させるかどうかの判断に使う。 */
export function isScrollSyncActive(): boolean {
  return active !== null;
}

/** テスト用。座標と行番号の変換だけを取り出して検証できるようにする。 */
export const internals = { anchorsOf, lineForTop, topForLine };
