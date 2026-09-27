/**
 * Split で本文を打ち替えたときのプレビュー更新（F-MODE-03 / N-PERF-03）。
 *
 * `open.ts`（メタ情報・履歴・監視・ダーティ状態を扱う）とは別にしてある。
 * ここは同じファイルを見続けたまま再描画するだけの担当である。
 * 本文の DOM 再構築はパース本体よりコストが高いため、打鍵ごとには描かず打ち終わりを待つ（N-PERF-03）。
 * 本文は作り直さず、変わったブロックだけを差し替える（`preview/paint.ts` の `patch` / #159）。
 */
import { enhance, paintMarp, patch } from '@/features/preview';
import { takeEditorLead, viewStore } from '@/features/view';
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
import { dirOf } from '@/lib/path';
import { isOutlineOnScreen, refreshOutline, refreshSearch } from '@/lib/refresh';
import type { OutlineItem } from '@/markdown/plugins/line-map';

import { getParseOptions, getParser } from './open';
import { documentStore } from './store.svelte';
import { getDocumentText } from './text';

const PREVIEW_SELECTOR = '#mx-preview';

/**
 * 打ち終わりを待つ時間。
 *
 * 短いほど反映は速くなるが、短すぎると打鍵のたびに再描画する。
 * 日本語入力では 1 文字が確定するまでに変更イベントが何度も発火するため、それを吸収できる長さにしてある。
 */
const DEBOUNCE_MS = 120;

let timer: ReturnType<typeof setTimeout> | null = null;
/** 実行中の再描画。並行して実行しない（後から要求されたほうが正しい）。 */
let inflight: Promise<void> | null = null;
let again = false;

/**
 * 見出し（`documentStore.outline`）が本文より古いか。
 *
 * Edit ではアウトラインを閉じているとパースしないため、打鍵のたびに古くなる。
 * 折りたたみ（`features/editor/lazy/folding.ts`）はそれを知って取り直す必要がある（`latestOutline`）。
 */
let outlineStale = false;

/**
 * 再描画 1 回ぶんの時刻（`features/bench/input.ts` が読む / 計測専用）。
 *
 * 「編集 → プレビュー更新」は入力を終えてから画面が変わるまでであり、そこには debounce・パース・paint が含まれる。
 * 内訳が無いと、差が出たときにパースと paint のどちらが原因か判別できない。
 */
export interface LiveRenderTiming {
  /** 再描画を予約した最後の時刻。入力を終えた時刻にあたる。 */
  scheduledAt: number;
  /** debounce が終了して再描画を開始した時刻。 */
  startedAt: number;
  /**
   * パースを開始してから結果が返るまでの時間で、そのままメインスレッドの占有時間になる。
   *
   * `parseMs`（パイプライン自身が報告する値）との差が、その外側の処理（チャンクの解決 / 文字数の集計）にあたる。
   */
  parseWaitMs: number;
  /** パイプライン自身が申告したパース時間（`ParseResult.parseMs`）。 */
  parseMs: number;
  /** paint と enhance を終えた時刻。画面に反映されるのは次のフレームである。 */
  paintedAt: number;
}

/**
 * 再描画の時刻を受け取る先。計測が有効でないときは時刻を取得しない。
 *
 * `scheduleLiveRender` は打鍵ごとに呼ばれるため、無条件に `performance.now()` を呼ぶと計測していない通常の入力にもコストが乗る。
 * コスト自体は小さいが、入力レスポンスを測る仕組みが入力レスポンスを悪化させるのは避ける。
 */
let observer: ((timing: LiveRenderTiming) => void) | null = null;
let scheduledAt = 0;

/**
 * 診断用の内訳（`features/bench/input.ts` / 計測専用）。
 *
 * 再描画が発生しなかったときに、どこで止まったかを判別するために持つ。
 * 予約されていないのか、開始後に失敗したのかで原因が異なる。
 */
const debug = { scheduled: 0, started: 0, finished: 0, lastError: null as string | null };

/** 診断用。計測専用。 */
export function liveRenderDebug(): typeof debug {
  return { ...debug };
}

/** 計測を付ける / 外す（`features/bench/input.ts` / 計測専用）。 */
export function observeLiveRender(next: ((timing: LiveRenderTiming) => void) | null): void {
  observer = next;
}

/**
 * 再描画（あるいはパースのやり直し）を予約する。
 *
 * 打った内容を反映する対象が存在するときだけ動作する。
 * Split では右のプレビュー（パース + paint）、Edit ではアウトラインが出ていればパースだけを行い、Preview では何もしない。
 * Edit で paint しないのは見えない面に CPU を使わないためだが（N-PERF-05）、見出しは表示されているのでそちらだけ取り直す（アウトラインが閉じていれば不要）。
 */
export function scheduleLiveRender(): void {
  outlineStale = true;
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
 * いま打った内容を反映する対象があるか（上の説明）。
 *
 * ペインの開閉を直接参照しない。
 * アウトラインが表示されているかどうかはアウトライン側から登録してもらう（`lib/refresh.ts`）。
 */
function wantsRender(): boolean {
  const mode = viewStore.mode;
  if (mode === 'split') return true;
  return mode === 'edit' && isOutlineOnScreen();
}

/**
 * アウトラインが出た時点で見出しを取り直す（`Outline.svelte` がマウント時に呼ぶ）。
 *
 * Edit のときだけ意味を持つ。
 * 閉じているアウトラインのためにパースはしていないため、開いた時点の見出しは打鍵の回数だけ古くなっている。
 * プレビューの面が表示されているモードでは再描画の経路を通っているため、取り直す対象は無い。
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
 * いまの本文に対応する見出しを返す（`features/editor/lazy/folding.ts` が折りたたみの範囲に使う）。
 *
 * 予約中の再描画は前倒しし、実行中の再描画は終わるのを待つ。それでも見出しが古ければ 1 回だけパースし直す。
 * Preview ではパースしない。
 * 面が表示されている間に本文が変わるのはタスクの反転（見出しの位置は変わらない）と読み直し（開く経路が見出しを入れ直す）だけである。
 */
export async function latestOutline(): Promise<readonly OutlineItem[]> {
  if (viewStore.mode === 'preview') return documentStore.outline;
  cancelLiveRender();
  if (inflight) await inflight;
  if (outlineStale) await renderNow();
  return documentStore.outline;
}

/**
 * いますぐ再描画する。プレビューの面へ戻った直後に 1 回だけ呼ぶ（`features/mode/mode.ts`）。
 *
 * Edit では paint を行わない。
 * 表示していない面の DOM は作り直さず、パースの結果（見出し・文字数）だけをストアへ入れる。
 *
 * 実行中に再度呼ばれた場合は、実行中の処理が終わってから 1 回だけやり直し、そのやり直しまで含めて待つ。
 * パースは非同期であるため、並行して実行すると古い結果が後から届いて本文が前の状態に戻る。
 */
export function renderNow(): Promise<void> {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = renderUntilSettled();
  return inflight;
}

/** 1 回描画し、その間に要求があればやり直す。やり直しを待ってから解決するため、実行中に受け取った側もやり直しまで待つことになる。 */
async function renderUntilSettled(): Promise<void> {
  try {
    await renderOnce();
  } finally {
    inflight = null;
  }
  if (again) {
    again = false;
    await renderNow();
  }
}

async function renderOnce(): Promise<void> {
  const parser = getParser();
  const container = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  const meta = documentStore.meta;
  if (!parser || !container || !meta) return;

  debug.started++;
  // 開始時点の値を保持する。
  // 描画中も打鍵は続き、`scheduledAt` はそのたびに更新される。
  // 保持しないと、入力を終えてから画面が変わるまでの時間が次の打鍵からの差になり、値が小さくなる（`huge.md` では負の値にもなる）。
  const scheduledFor = scheduledAt;
  const startedAt = observer ? performance.now() : 0;
  // 本文を読む前に false にする。パースの途中で打鍵があれば `scheduleLiveRender` が再び true にする。
  outlineStale = false;
  try {
    const parsed = await parser.parse(getDocumentText(), getParseOptions());
    const parsedAt = observer ? performance.now() : 0;

    // 表示していない面の DOM は作り直さない（N-PERF-05）。
    // Edit で必要なのはパースの結果だけで、本文は Preview へ戻るときに 1 回だけ描画する（`features/mode/mode.ts`）。
    const visible = viewStore.mode !== 'edit';

    if (visible) {
      // 差し替えた要素の高さが変わると、ブラウザのスクロールアンカーがプレビューの位置を補正して `scroll` が発火する。
      // 利用者の操作ではないため、主導権をエディター側に置いてエディターが打っている行から離れないようにする。
      takeEditorLead();
      if (parsed.marp) {
        // NOTE: スライドは差分更新せず全体を入れ直す。同じタスク内で入れ直すため、通常はスクロール位置が保たれる。
        const scrollTop = container.scrollTop;
        const { notice } = await paintMarp(container, parsed.marp, dirOf(meta.path ?? ''));
        if (container.scrollTop !== scrollTop) container.scrollTop = scrollTop;
        if (notice) documentStore.notice = { level: 'warning', message: notice };
      } else {
        patch(container, parsed.blocks, parsed.frontMatter);
      }
    }

    documentStore.frontMatter = parsed.frontMatter;
    documentStore.textStats = parsed.textStats;
    documentStore.outline = parsed.outline;

    if (visible) {
      // 無題の文書（`Ctrl+N`）には基準となるディレクトリが無い。
      // 相対パスの画像は解決できないため、`enhance` はスコープ外として扱う（`preview/enhance.ts`）。
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
    // 例外を通知に出す。
    // ここは `void renderNow()` で呼ばれるため、投げた例外はどこにも捕捉されない。
    // 本文は前の内容のまま残るが、入力しても右側が更新されない状態になり、原因を特定できない。
    debug.lastError = toMessage(e);
    outlineStale = true;
    documentStore.notice = { level: 'error', message: ja.error.renderFailed };
  }
}

/** テスト用。予約と実行状態を初期化する。 */
export function resetLiveRender(): void {
  cancelLiveRender();
  inflight = null;
  again = false;
  outlineStale = false;
  observer = null;
}
