/**
 * 入力レスポンスの計測（`--bench-input` / 遅延チャンク・計測専用）。
 * 「実際に打って実際に描画されるまで」でしか測れない 2 つの指標（キー入力 → 画面反映の 16ms 予算 / 打ち終わり → プレビュー反映）のためにある（05.performance-budget/04-targets.md §3）。
 *
 * 起点は「打つと決めていた時刻」を使う。
 * 実行時刻を起点にすると、メインスレッドの処理が遅延してタイマー自体が遅れた分が計測から漏れてしまう。
 * 打鍵の間隔はシード固定の擬似乱数で決め、実装変更の前後で同じ打鍵列を使えるようにする。
 *
 * `bootstrap.ts` からの動的 import でフラグが指定された起動でしか読み込まず、`editor` の実体も動的 import なのでこのチャンクに Monaco は含まれない。
 */
/*
 * 打鍵は時間順に 1 つずつ発生させる。
 * 並行に実行すると予定時刻どおりに入力できず、計測が成立しない。
 * ここでの逐次 await は非効率ではなく仕様である。
 */
/* eslint-disable no-await-in-loop */
import {
  documentStore,
  getParser,
  liveRenderDebug,
  observeLiveRender,
  type LiveRenderTiming,
} from '@/features/document';
import { setMode } from '@/features/mode';
import { viewStore } from '@/features/view';
import { getPlatform } from '@/platform';

/**
 * 打鍵の組み立て（`docs/measurements/` の計測仕様と 1:1）。
 *
 * バーストの区切りは `live.ts` の debounce（120ms）より長くする必要がある。
 * 超えないと再描画が 1 回も発生せず、プレビューへの反映時間を観測できない。
 */
const PLAN = {
  bursts: 24,
  keysPerBurst: 8,
  /** 打鍵間隔の下限・上限（ms）。中央値 65ms は 200wpm 相当。 */
  minGapMs: 40,
  maxGapMs: 90,
  /** バーストの区切り。debounce（120ms）を必ず超える値にする。 */
  pauseMs: 260,
  /** 擬似乱数のシード。実行ごとに同じ打鍵列にするため固定する。 */
  seed: 0x4d_58_44_4e,
} as const;

/** 打つ文字。記法を壊さない普通の本文にする（書式コマンドを誘発させない）。 */
const ALPHABET = 'marxdown ';

/**
 * mulberry32。要件はシードから決まる列であることだけで、乱数としての品質は問わない。
 * `Math.random()` を使うと打鍵列が実行ごとに変わり、比較できなくなる。
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * 打鍵 1 つぶん。
 * `waitMs`（メインスレッドが空くのを待った時間）・`typeMs`（Monaco が編集に使った時間）・`responseMs`（打鍵が届いてから次のフレームまで）・`latencyMs`（予定時刻から次のフレームまで）の 4 つを採るのは、1 つでは切り分けられないためである。
 *
 * `setTimeout` で打鍵を起こすため Windows のタイマー粗さ（中央値で約 5ms の遅れ）が `waitMs` に混ざるが、どの実行にも同じだけ含まれるため、実装の前後を比較する分には相殺される。
 * 予算（16ms）は `responseMs` で見る。
 * `responseMs`/`latencyMs` には次の vsync までの待ちが必ず入るため、処理が 0 でも 0〜16ms 加わる。
 */
interface KeySample {
  /** 打つと決めていた時刻からの、実際に打てた時刻までの遅れ。 */
  waitMs: number;
  /** `type` が返るまでの同期的な処理時間。 */
  typeMs: number;
  /** 打鍵が届いてから、エディターが再描画した直後のフレームまで。性能予算の判定にはこの値を使う。 */
  responseMs: number;
  /** 予定時刻起点。`waitMs` を含む。 */
  latencyMs: number;
}

/** プレビューの再描画 1 回ぶん。 */
interface PreviewSample {
  /** 入力を終えてから画面に反映されるフレームまで。 */
  totalMs: number;
  /** うち debounce（`live.ts` の 120ms）。差し引いて中身を見るために持つ。 */
  debounceMs: number;
  /** パースを開始してから結果が返るまで。メインスレッドの占有時間にあたる。 */
  parseWaitMs: number;
  /** パイプライン自身の申告値。 */
  parseMs: number;
  /** paint と enhance の所要時間。 */
  paintMs: number;
}

interface Stats {
  n: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

function stats(values: number[]): Stats {
  if (values.length === 0) return { n: 0, p50: Number.NaN, p95: Number.NaN, max: Number.NaN, mean: Number.NaN };
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
  return {
    n: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted.at(-1) ?? Number.NaN,
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

function sleepUntil(target: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, target - performance.now()));
  });
}

/**
 * 次のフレームを待つ。Monaco の描画の後に実行される。
 *
 * Monaco は編集処理の中で自身の描画を次のフレームへ予約する。
 * rAF のコールバックは登録順に呼ばれるため、`type` の後に登録したこの処理はその描画の後に実行される。
 * 画面への反映（合成）はさらに後であり、計測の対象外である。
 */
function nextFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(performance.now()));
  });
}

/** 値が `quietMs` のあいだ増えなくなるまで待つ。上限で打ち切る。 */
async function settle(count: () => number, quietMs: number, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  let last = count();
  let lastChangedAt = performance.now();

  while (performance.now() < deadline) {
    await sleepUntil(performance.now() + 100);
    const now = count();
    if (now !== last) {
      last = now;
      lastChangedAt = performance.now();
    } else if (performance.now() - lastChangedAt >= quietMs) {
      return;
    }
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return true;
    await sleepUntil(performance.now() + 25);
  }
  return predicate();
}

/**
 * 計測を実行し、結果を書き出して終了する。この関数から制御は戻らない（プロセスが終了する）。
 *
 * 途中で継続できなくなった場合も `error` を入れて結果を書き出す。
 * 応答が無いまま停止すると、実行元の `scripts/bench-input.mjs` からはタイムアウトとしか判別できず、原因を特定できない。
 */
export async function runInputBench(): Promise<void> {
  const platform = getPlatform();
  const keys: KeySample[] = [];
  const previews: PreviewSample[] = [];
  let error: string | null = null;
  /** 診断用。再描画が発生したかどうかと、そのときの表示モードを記録する。 */
  let renders = 0;
  let mode = 'unknown';

  try {
    // Split でのみ意味を持つ。
    // プレビューが表示されていない面では `live.ts` が再描画しない（N-PERF-05）。
    if (viewStore.mode !== 'split') await setMode('split');

    const editor = await import('@/features/editor/lazy/editor');
    const mounted = await waitFor(() => editor.isEditorMounted(), 60_000);
    if (!mounted) throw new Error('エディターが載らなかった');

    editor.moveToEndForBench();
    editor.focusEditor();

    // 最初の再描画（Split へ入ったときの 1 回）が終わってから始める。
    // これを待たないと、1 バースト目が「開いたときの描画」と重なる。
    await sleepUntil(performance.now() + 1000);

    mode = viewStore.mode;

    const startedAt = performance.now();
    observeLiveRender((timing: LiveRenderTiming) => {
      renders++;
      // Split へ入った時点の再描画は打鍵に対応しないため除外する。
      if (timing.scheduledAt < startedAt) return;
      void nextFrame().then((frameAt) => {
        previews.push({
          totalMs: frameAt - timing.scheduledAt,
          debounceMs: timing.startedAt - timing.scheduledAt,
          parseWaitMs: timing.parseWaitMs,
          parseMs: timing.parseMs,
          paintMs: timing.paintedAt - timing.startedAt - timing.parseWaitMs,
        });
        return frameAt;
      });
    });

    const random = seeded(PLAN.seed);
    let cursor = performance.now();

    for (let burst = 0; burst < PLAN.bursts; burst++) {
      for (let i = 0; i < PLAN.keysPerBurst; i++) {
        cursor += PLAN.minGapMs + random() * (PLAN.maxGapMs - PLAN.minGapMs);
        const target = cursor;

        await sleepUntil(target);
        const firedAt = performance.now();
        editor.typeForBench(ALPHABET[(burst * PLAN.keysPerBurst + i) % ALPHABET.length] ?? 'x');
        const typedAt = performance.now();
        const renderedAt = await nextFrame();

        keys.push({
          waitMs: firedAt - target,
          typeMs: typedAt - firedAt,
          responseMs: renderedAt - firedAt,
          latencyMs: renderedAt - target,
        });
      }
      cursor += PLAN.pauseMs;
      await sleepUntil(cursor);
    }

    // 残っている再描画を待つ。回数はバーストの数と一致するとは限らない。
    // `huge.md` では 1 回の再描画が区切りより長くかかり、複数のバーストが 1 回にまとまる（`live.ts` の `again`）。
    // 回数で待つと一部を記録できないため、増加が止まった時点で終了する。
    await settle(() => previews.length, 1500, 15_000);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    observeLiveRender(null);
  }

  const report = {
    version: 1,
    plan: PLAN,
    error,
    /** 診断用。`renders` が 0 なら再描画の経路そのものが動作していない。 */
    diagnostics: {
      renders,
      mode,
      live: liveRenderDebug(),
      hasParser: getParser() !== null,
      hasMeta: documentStore.meta !== null,
      hasContainer: document.querySelector('#mx-preview') !== null,
    },
    /** 打鍵が届く → エディターに反映（予算 16ms の対象）。 */
    keyResponseMs: stats(keys.map((s) => s.responseMs)),
    /** 予定 → エディターに反映。タイマーの粗さを含む。 */
    keyLatencyMs: stats(keys.map((s) => s.latencyMs)),
    /** 予定 → 実際に打てた時刻。メインスレッドの遅延そのもの。 */
    keyWaitMs: stats(keys.map((s) => s.waitMs)),
    /** Monaco がその編集に使った時間。 */
    keyTypeMs: stats(keys.map((s) => s.typeMs)),
    /** 打ち終わり → プレビューに反映。 */
    previewTotalMs: stats(previews.map((s) => s.totalMs)),
    previewDebounceMs: stats(previews.map((s) => s.debounceMs)),
    previewParseWaitMs: stats(previews.map((s) => s.parseWaitMs)),
    previewParseMs: stats(previews.map((s) => s.parseMs)),
    previewPaintMs: stats(previews.map((s) => s.paintMs)),
    /** 生の値も残す。分布を見直したくなったときに測り直さずに済む。 */
    samples: { keys, previews },
  };

  await platform.benchInputDone(JSON.stringify(report));
}
