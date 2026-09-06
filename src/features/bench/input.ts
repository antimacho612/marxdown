/**
 * 入力レスポンスの計測（`--bench-input` / 遅延チャンク・計測専用）。
 * 「実際に打って実際に描かれるまで」でしか測れない 2 つの指標（06.roadmap/m2-editor.md §3 の 16ms 予算 / OQ-15 の Worker 比較）のためにある。
 *
 * 起点は「打つと決めていた時刻」を使う。
 * 実行時刻を起点にすると、メインスレッドの処理が遅延してタイマー自体が遅れた分が計測から漏れてしまう。
 * 刺激（打鍵の間隔）はシード固定の擬似乱数で両アーム同一にし、実装変更の前後を比較できるようにする。
 *
 * `bootstrap.ts` からの動的 import でフラグが立った起動でしか取りに行かず、`editor` の実体も動的 import なのでこのチャンクに Monaco は入らない。
 */
/*
 * **打鍵は時間順に 1 つずつ起こす。** 並行に流したら「予定時刻に打つ」が成立せず、
 * 計測そのものが意味を失う。ここでの逐次 await は非効率ではなく仕様である。
 */
/* eslint-disable no-await-in-loop */
import { liveRenderDebug, observeLiveRender, type LiveRenderTiming } from '@/features/document/live';
import { getParser } from '@/features/document/open';
import { documentStore } from '@/features/document/store.svelte';
import { setMode } from '@/features/mode';
import { viewStore } from '@/features/view';
import { getPlatform } from '@/platform';

/* ------------------------------------------------------------------ */
/* 刺激                                                                */
/* ------------------------------------------------------------------ */

/**
 * 打鍵の組み立て（`docs/measurements/` の計測仕様と 1:1）。
 *
 * バーストの区切りは **`live.ts` の debounce（120ms）より長い**ことが要る。
 * 越えないと描き直しが 1 回も起きず、OQ-15 の判定対象そのものが観測できない。
 */
const PLAN = {
  bursts: 24,
  keysPerBurst: 8,
  /** 打鍵間隔の下限・上限（ms）。中央値 65ms は 200wpm 相当。 */
  minGapMs: 40,
  maxGapMs: 90,
  /** バーストの区切り。**debounce（120ms）を必ず越える。** */
  pauseMs: 260,
  /** 擬似乱数のシード。**両アームで同じ打鍵列にするために固定する。** */
  seed: 0x4d_58_44_4e,
} as const;

/** 打つ文字。記法を壊さない普通の本文にする（書式コマンドを誘発させない）。 */
const ALPHABET = 'marxdown ';

/**
 * mulberry32。**シードから決まる列であることだけが要件**で、質は問わない。
 * `Math.random()` を使うと打鍵列がアームごとに変わり、比較にならない。
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

/* ------------------------------------------------------------------ */
/* 記録                                                                */
/* ------------------------------------------------------------------ */

/**
 * 打鍵 1 つぶん。
 * `waitMs`（メインスレッドが空くのを待った時間）・`typeMs`（Monaco が編集に使った時間）・`responseMs`（打鍵届いてから次のフレームまで）・`latencyMs`（予定時刻から次のフレームまで）の 4 つを採るのは、1 つでは切り分けられないためである。
 *
 * `setTimeout` で打鍵を起こすため Windows のタイマー粗さ（実測中央値 5ms 遅れ）が `waitMs` に混ざるが、両アームで同じだけ乗るため worker/main の差を見る分には相殺される。
 * 予算（16ms）は `responseMs` で見る。
 * `responseMs`/`latencyMs` には次の vsync までの待ちが必ず入るため、仕事が 0 でも 0〜16ms 乗る。
 */
interface KeySample {
  /** 打つと決めていた時刻からの、実際に打てた時刻までの遅れ。 */
  waitMs: number;
  /** `type` が返るまでの同期的な仕事。 */
  typeMs: number;
  /** 打鍵が届いてから、エディターが描き直した直後のフレームまで。**予算はこれで見る。** */
  responseMs: number;
  /** 予定時刻起点。`waitMs` を含む。 */
  latencyMs: number;
}

/** プレビューの描き直し 1 回ぶん。 */
interface PreviewSample {
  /** 打ち終わり → 画面に出るフレーム。**OQ-15 の判定基準。** */
  totalMs: number;
  /** うち debounce（`live.ts` の 120ms）。差し引いて中身を見るために持つ。 */
  debounceMs: number;
  /** パースを投げてから返るまで。**Worker では往復、メインでは占有時間。** */
  parseWaitMs: number;
  /** パイプライン自身の申告値。 */
  parseMs: number;
  /** paint と enhance。**両アームで共通の項**なので、差の分母として要る。 */
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

/* ------------------------------------------------------------------ */
/* 実行                                                                */
/* ------------------------------------------------------------------ */

function sleepUntil(target: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, target - performance.now()));
  });
}

/**
 * 次のフレーム。**Monaco の描画の後に回ってくる。**
 *
 * Monaco は編集の中で自分の描画を次のフレームへ予約する。rAF のコールバックは
 * 登録順に呼ばれるので、`type` の後に登録したこれは**その描画を終えた後**に走る。
 * 画面へ出るのはこの後（合成）で、そこは計測の外にある。
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
 * 計測を走らせ、結果を書き出して終わる。**戻ってこない**（プロセスが落ちる）。
 *
 * 途中で立ち行かなくなったときも結果を書き出す（`error` を入れて）。
 * 黙って固まると、回している `scripts/bench-input.mjs` からは
 * タイムアウトとしか見えず、原因が読めない。
 */
export async function runInputBench(): Promise<void> {
  const platform = getPlatform();
  const keys: KeySample[] = [];
  const previews: PreviewSample[] = [];
  let error: string | null = null;
  /** 診断用。**描き直しが起きたか**と、そのときの表示モード。 */
  let renders = 0;
  let mode = 'unknown';

  try {
    // **Split でしか意味がない。** プレビューが見えていない面では
    // `live.ts` が描き直さない（N-PERF-05）。
    if (viewStore.mode !== 'split') await setMode('split');

    const editor = await import('@/features/editor/editor');
    const mounted = await waitFor(() => editor.isEditorMounted(), 60_000);
    if (!mounted) throw new Error('エディターが載らなかった');

    editor.moveToEndForBench();
    editor.focusEditor();

    // 最初の描き直し（Split へ入ったときの 1 回）が終わってから始める。
    // これを待たないと、1 バースト目が「開いたときの描画」と重なる。
    await sleepUntil(performance.now() + 1000);

    mode = viewStore.mode;

    const startedAt = performance.now();
    observeLiveRender((timing: LiveRenderTiming) => {
      renders++;
      // Split へ入った時点の描き直しは打鍵に紐づかない。捨てる。
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

    // 残っている描き直しを待つ。**バーストの数だけ来るとは限らない。**
    // `huge.md` では 1 回の描き直しが区切りより長く、複数のバーストが
    // 1 回にまとまる（`live.ts` の `again`）。数で待つと必ず取りこぼす。
    // **増えなくなったら終わり**にする。
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
    /** 診断用。`renders` が 0 なら描き直しの経路そのものが動いていない。 */
    diagnostics: {
      renders,
      mode,
      live: liveRenderDebug(),
      hasParser: getParser() !== null,
      hasMeta: documentStore.meta !== null,
      hasContainer: document.querySelector('#mx-preview') !== null,
    },
    /** 打鍵が届く → エディターに反映（06.roadmap/m2-editor.md §3 の 16ms はこれ）。 */
    keyResponseMs: stats(keys.map((s) => s.responseMs)),
    /** 予定 → エディターに反映。タイマーの粗さを含む。 */
    keyLatencyMs: stats(keys.map((s) => s.latencyMs)),
    /** 予定 → 実際に打てた時刻。メインスレッドの遅延そのもの。 */
    keyWaitMs: stats(keys.map((s) => s.waitMs)),
    /** Monaco がその編集に使った時間。 */
    keyTypeMs: stats(keys.map((s) => s.typeMs)),
    /** 打ち終わり → プレビューに反映（OQ-15 の判定基準）。 */
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
