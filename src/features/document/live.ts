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
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
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
 * 描き直し 1 回ぶんの時刻（`features/bench/input.ts` が読む / 計測専用）。
 *
 * OQ-15 の判定基準は「打ち終わってから画面が変わるまで」であり、
 * そこには debounce・パース・paint が含まれる。**内訳が無いと、
 * 差が出たときに Worker のせいなのか paint のせいなのかが分からない。**
 */
export interface LiveRenderTiming {
  /** 描き直しを予約した最後の時刻。**打ち終わりの時刻**そのもの。 */
  scheduledAt: number;
  /** debounce が明けて描き直しに入った時刻。 */
  startedAt: number;
  /**
   * パースを投げてから結果が返るまで。**そのままメインスレッドの占有時間。**
   *
   * `parseMs`（パイプライン自身の申告値）との差が、その外側の仕事
   * （チャンクの解決 / 文字数の集計）になる。
   */
  parseWaitMs: number;
  /** パイプライン自身が申告したパース時間（`ParseResult.parseMs`）。 */
  parseMs: number;
  /** paint と enhance を終えた時刻。**画面に出るのはこの次のフレーム。** */
  paintedAt: number;
}

/**
 * 描き直しの時刻を受け取る先。**計測が付いていないときは時刻を取らない。**
 *
 * `scheduleLiveRender` は打鍵ごとに呼ばれるので、無条件に `performance.now()` を
 * 置くと計測していない普段の入力にも乗る。安くはあるが、**入力レスポンスを
 * 測るための仕掛けが入力レスポンスを食う**のは筋が悪い。
 */
let observer: ((timing: LiveRenderTiming) => void) | null = null;
let scheduledAt = 0;

/**
 * 診断用の内訳（`features/bench/input.ts` / 計測専用）。
 *
 * **描き直しが起きなかったとき、どこで止まったかが分からない**という問題が
 * 実際に起きた。予約されていないのか、始まって落ちたのかで原因がまるで違う。
 */
const debug = { scheduled: 0, started: 0, finished: 0, lastError: null as string | null };

/** 診断用。**計測専用。** */
export function liveRenderDebug(): typeof debug {
  return { ...debug };
}

/** 計測を付ける / 外す（`features/bench/input.ts` / 計測専用）。 */
export function observeLiveRender(next: ((timing: LiveRenderTiming) => void) | null): void {
  observer = next;
}

/**
 * プレビューを描き直す予約をする。**Split のときだけ働く。**
 *
 * 他のモードではプレビューが見えていないので、描き直す意味が無い
 * （N-PERF-05 / 見えない面のために CPU を使わない）。Split へ入る時点で
 * 1 回描き直すので、Edit のあいだに打った内容も取りこぼさない。
 */
export function scheduleLiveRender(): void {
  if (viewStore.mode !== 'split') return;

  debug.scheduled++;
  if (observer) scheduledAt = performance.now();

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
  debug.started++;
  // **入った時点の値を控える。** 描いているあいだも打鍵は続き、`scheduledAt` は
  // そのたびに先へ進む。控えないと「打ち終わってから画面が変わるまで」が
  // 次の打鍵からの差になり、値が縮む（`huge.md` では負にもなる）。
  const scheduledFor = scheduledAt;
  const startedAt = observer ? performance.now() : 0;
  try {
    const parsed = await parser.parse(getDocumentText());
    const parsedAt = observer ? performance.now() : 0;

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

    observer?.({
      scheduledAt: scheduledFor,
      startedAt,
      parseWaitMs: parsedAt - startedAt,
      parseMs: parsed.parseMs,
      paintedAt: performance.now(),
    });
    debug.finished++;
  } catch (e) {
    // **黙って止まらないようにする。** ここは `void renderNow()` で呼ばれるので、
    // 投げた例外は誰にも拾われない。本文は前の内容のまま残るが、**打っても
    // 右が変わらない**状態になり、原因が読めない（M2 Phase 6 で実際に踏んだ）。
    debug.lastError = toMessage(e);
    documentStore.notice = { level: 'error', message: `${ja.error.renderFailed}: ${toMessage(e)}` };
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
  observer = null;
}
