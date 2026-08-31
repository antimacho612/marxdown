/**
 * Split のスクロール同期と双方向ジャンプ（F-MODE-05 / 03.ux-spec/03-split-mode.md §2, §3）。
 *
 * # 行番号が唯一の共通座標
 *
 * プレビューのブロック要素には `data-line="開始行"` が付いている
 * （`markdown/plugins/line-map.ts` / 02.architecture/06-markdown-rendering-pipeline.md §3）。
 * エディタ側は行番号をそのまま持っているので、**両者を結ぶのは行番号だけ**でよい。
 * DOM の対応表も、要素同士の対応も持たない。
 *
 * # エディタの実体を知らない
 *
 * このモジュールは `main` チャンクにいる。エディタを直接 import すると
 * `editor` チャンクがクリティカルパスに載る（`document/text.ts` と同じ理由）。
 * したがって受け取るのは **`EditorScrollPort` という行番号だけの窓口**であって、
 * `EditorView` でも `IStandaloneCodeEditor` でもない。
 *
 * **ここに engine 固有の座標計算を持ち込まないこと。** 「スクロール量と行番号を
 * どう換算するか」はエンジンごとに違い、その知識はポートの実装側
 * （`features/editor/scroll-port.ts`）にだけ置く。
 *
 * # 行の対応だけでは足りない
 *
 * 1 行の見出しと 50 行のコードブロックでは、行あたりの高さが桁で違う。
 * **`data-line` を持つ要素のあいだを線形補間する**（§3 のアルゴリズム）。
 *
 * ```text
 * A.line <= L < B.line のとき
 *   preview 位置 = A.top + (B.top - A.top) * (L - A.line) / (B.line - A.line)
 * ```
 *
 * # 相互発火を止める
 *
 * 片方を動かすと相手の `scroll` が飛び、それがまた片方を動かす。
 * **主導権は「最後に操作した側」が持つ**（§2）。動かされた側からの
 * 同期を短いあいだ黙らせることで、揺り戻しを防ぐ。
 *
 * 時間で黙らせているのは、`scroll` が「誰が起こしたか」を持たないため。
 * 慣性スクロール（§2）もこの窓の中に収まる。
 */
import { viewStore } from '@/features/view/store.svelte';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * エディタ側の窓口。実装は `features/editor/scroll-port.ts`（`editor` チャンク）。
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
 * **短すぎると揺り戻し、長すぎると「反対側を触ってもすぐ効かない」。**
 * 慣性スクロールが落ち着くまでの実測（Windows のホイール）に合わせてある。
 */
const SUPPRESS_MS = 120;

/** 行番号と、プレビュー上でのその行の位置。 */
interface Anchor {
  line: number;
  top: number;
}

interface Sync {
  port: EditorScrollPort;
  preview: HTMLElement;
  dispose: () => void;
}

let active: Sync | null = null;

/** どちら側が主導しているか。`null` は「どちらでもない（受け付ける）」。 */
let leader: 'editor' | 'preview' | null = null;
let leaderUntil = 0;

/**
 * 同期を始める。**Split に入ったときに呼ぶ。**
 *
 * 2 回目以降は何もしない。抜けるときは `stopScrollSync`。
 */
export function startScrollSync(port: EditorScrollPort): void {
  if (active) return;

  const preview = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!preview) return;

  const offEditorScroll = port.onScroll(() => {
    if (!take('editor')) return;
    syncPreviewToEditor(port, preview);
  });

  const onPreviewScroll = (): void => {
    if (!take('preview')) return;
    syncEditorToPreview(port, preview);
  };

  // プレビューの要素をダブルクリック → エディタの該当行へ（§3）。
  // **Split のあいだだけ効く。** Preview だけで読んでいるときは飛ぶ先が無い。
  const onPreviewDoubleClick = (event: MouseEvent): void => {
    const line = lineAtEvent(event);
    if (line === null) return;
    jumpToEditorLine(line);
  };

  preview.addEventListener('scroll', onPreviewScroll, { passive: true });
  preview.addEventListener('dblclick', onPreviewDoubleClick);

  active = {
    port,
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
 * **反対側が主導している間は false。** 動かされた側の `scroll` を
 * そこで止めることで、揺り戻しの輪を断つ。
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
    // 行番号は 0 始まり（markdown-it の `token.map`）。エディタは 1 始まり。
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
 * プレビューの位置からエディタの行へ飛ぶ（プレビューのダブルクリック / §3）。
 *
 * **同期が OFF でも効く。** §2 の但し書きどおり、これは明示的な操作である。
 * 飛んだあとはエディタが主導権を持つ（そのまま打ち始められる）。
 */
export function jumpToEditorLine(line: number, options: { focus?: boolean } = {}): void {
  const port = active?.port;
  if (!port) return;

  leader = 'editor';
  leaderUntil = performance.now() + SUPPRESS_MS;

  // **フォーカスは呼び出し側が決める。** プレビューを叩いたなら移すのが自然だが、
  // アウトラインを叩いたのにエディタへ飛ばされると、続けて次の見出しを選べない。
  port.revealLine(line, { focus: options.focus !== false });
}

/**
 * エディタの行からプレビューの位置へ飛ぶ（アウトラインからのジャンプ / §3）。
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
