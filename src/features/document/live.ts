/**
 * Split で本文を打ち替えたときのプレビュー更新（F-MODE-03 / N-PERF-03）。
 *
 * # Split はこれが無いと成立しない
 *
 * F-MODE-03（MUST）は「ソース + プレビュー」であって、2 つの面を並べることではない。
 * **打った結果が右に出て初めて Split になる。**
 *
 * # 開く経路とは別にしてある
 *
 * `open.ts` が行うのは「ファイルを開く」で、**メタ情報・履歴・最近開いたファイル・
 * 監視・ダーティ状態**まで面倒を見る。ここでやるのは描き直しだけで、
 * それらには一切触らない。**同じ 1 つのファイルを見続けている**からである。
 *
 * # 打鍵ごとには描き直さない
 *
 * パース自体は `readme.md` で 0.32ms だが（measurements/04-markdown-pipeline.md）、
 * **本文の DOM を作り直すほうが高い**。1 打鍵ごとにやると入力が詰まる（N-PERF-03）。
 * 打ち終わりを待ってから 1 回だけ描く。
 *
 * # スクロール位置は自分で戻す
 *
 * `paint` は受け皿の中身を差し替えるので、**そのままでは先頭へ飛ぶ**。
 * 書いている場所が視界から消えるので、位置を控えて当て直す。
 * スクロール同期（`features/view/scroll-sync.ts`）は行番号で引き直すので、
 * DOM が変わること自体は問題にならない。
 */
import { enhance } from '@/features/preview/enhance';
import { paint } from '@/features/preview/paint';
import { viewStore } from '@/features/view/store.svelte';
import { dirOf } from '@/lib/path';

import { getParser } from './open';
import { refreshOutline, refreshSearch } from './refresh';
import { documentStore } from './store.svelte';
import { getDocumentText } from './text';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * 打ち終わりを待つ時間。
 *
 * **短いほど「書いたそばから出る」が、短すぎると打鍵のたびに描き直す。**
 * 日本語入力では 1 文字が確定するまでに何度も `docChanged` が飛ぶので、
 * その揺れを吸収できる長さにしてある。
 */
const DEBOUNCE_MS = 120;

let timer: ReturnType<typeof setTimeout> | null = null;
/** 走っている描き直し。**重ねて走らせない**（後から来たほうが正しい）。 */
let running = false;
let again = false;

/**
 * プレビューを描き直す予約をする。**Split のときだけ働く。**
 *
 * 他のモードではプレビューが見えていないので、描き直す意味が無い
 * （N-PERF-05 / 見えない面のために CPU を使わない）。Split へ入る時点で
 * 1 回描き直すので、Edit のあいだに打った内容も取りこぼさない。
 */
export function scheduleLiveRender(): void {
  if (viewStore.mode !== 'split') return;

  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void renderNow();
  }, DEBOUNCE_MS);
}

/** 予約を取り消す。Split を抜けるときに呼ぶ。 */
export function cancelLiveRender(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * いますぐ描き直す。Split へ入った直後に 1 回だけ呼ぶ。
 *
 * 走っている最中にもう一度来たら、**いまのぶんが終わってから 1 回だけやり直す。**
 * パースは非同期なので、重ねると古い結果があとから届いて本文が巻き戻る。
 */
export async function renderNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }

  const parser = getParser();
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  const meta = documentStore.meta;
  if (!parser || !container || !meta) return;

  running = true;
  try {
    const parsed = await parser.parse(getDocumentText());

    // `paint` は中身を差し替える。控えてから当て直す。
    const scrollTop = container.scrollTop;
    paint(container, parsed.chunks, parsed.frontMatter);
    container.scrollTop = scrollTop;

    documentStore.frontMatter = parsed.frontMatter;
    documentStore.textStats = parsed.textStats;
    documentStore.outline = parsed.outline;

    enhance(container, { baseDir: dirOf(meta.path) });
    refreshSearch();
    refreshOutline();
  } finally {
    running = false;
  }

  if (again) {
    again = false;
    await renderNow();
  }
}

/** テスト用。 */
export function resetLiveRender(): void {
  cancelLiveRender();
  running = false;
  again = false;
}
