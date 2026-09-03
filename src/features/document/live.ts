/**
 * Split で本文を打ち替えたときのプレビュー更新（F-MODE-03 / N-PERF-03）。
 *
 * `open.ts`（メタ情報・履歴・監視・ダーティ状態を扱う）とは別にしてある。
 * ここは同じファイルを見続けたまま描き直すだけの担当である。
 * 本文の DOM 再構築はパース本体よりコストが高いため、打鍵ごとには描かず打ち終わりを待つ（N-PERF-03）。
 * `paint` は受け皿を差し替えて表示位置を先頭に戻すため、スクロール位置は自分で保持して再設定する。
 */
import { enhance } from '@/features/preview/enhance';
import { paint } from '@/features/preview/paint';
import { viewStore } from '@/features/view/store.svelte';
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
import { dirOf } from '@/lib/path';

import { getParser } from './open';
import { isOutlineOnScreen, refreshOutline, refreshSearch } from './refresh';
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
 * 描き直す（あるいはパースし直す）予約をする。
 *
 * 打った内容を反映する対象が存在するときだけ動作する。
 * Split では右のプレビュー（パース + paint）、Edit ではアウトラインが出ていればパースだけを行い、Preview では何もしない。
 * Edit で paint しないのは見えない面に CPU を使わないためだが（N-PERF-05）、見出しは表示されているのでそちらだけ取り直す（#59。アウトラインが閉じていれば不要）。
 */
export function scheduleLiveRender(): void {
  if (!wantsRender()) return;

  debug.scheduled++;
  if (observer) scheduledAt = performance.now();

  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void renderNow();
  }, DEBOUNCE_MS);
}

/**
 * いま打った内容を追いかける相手が居るか（上の表）。
 *
 * **ペインの開閉を直接見に行かない。** アウトラインが出ているかどうかは
 * あちらから名乗ってもらう（`document/refresh.ts`）。
 */
function wantsRender(): boolean {
  const mode = viewStore.mode;
  if (mode === 'split') return true;
  return mode === 'edit' && isOutlineOnScreen();
}

/**
 * アウトラインが出た時点で見出しを取り直す（`Outline.svelte` がマウント時に呼ぶ）。
 *
 * **Edit のあいだだけ意味がある。** 閉じているアウトラインのためにパースは
 * していないので、開いた時点の見出しは打鍵ぶんだけ古い。プレビューの面が
 * 見えているモードでは描き直しの経路を通っているので、取り直すものは無い。
 */
export async function refreshOutlineOnOpen(): Promise<void> {
  if (viewStore.mode !== 'edit') return;
  await renderNow();
}

/** 予約を取り消す。Split を抜けるときに呼ぶ。 */
export function cancelLiveRender(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * いますぐ描き直す。プレビューの面へ戻った直後に 1 回だけ呼ぶ（`features/view/mode.ts`）。
 *
 * **Edit では paint まで行かない。** 見えない面の DOM は作り直さず、
 * パースの結果（見出し・文字数）だけをストアへ入れる。
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

    // **見えていない面の DOM は作り直さない**（N-PERF-05）。Edit で要るのは
    // パースの結果だけで、本文は Preview へ戻るときに 1 回だけ描く（`features/view/mode.ts`）。
    const visible = viewStore.mode !== 'edit';

    if (visible) {
      // `paint` は中身を差し替える。控えてから当て直す。
      const scrollTop = container.scrollTop;
      paint(container, parsed.chunks, parsed.frontMatter);
      container.scrollTop = scrollTop;
    }

    documentStore.frontMatter = parsed.frontMatter;
    documentStore.textStats = parsed.textStats;
    documentStore.outline = parsed.outline;

    if (visible) {
      // 無題の文書（`Ctrl+N`）には基点が無い。相対パスの画像は解決できないので、
      // `enhance` はスコープ外として扱う（`preview/enhance.ts`）。
      enhance(container, { baseDir: dirOf(meta.path ?? '') });
      refreshSearch();
      refreshOutline();
    }

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
