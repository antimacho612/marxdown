/**
 * Mermaid ダイアグラムの描画（F-VIEW-12 / 04.tech-stack/04-markdown.md §4）。
 *
 * このモジュール自体は小さく、Mermaid 本体はさらに動的 import する。
 * フェンスが 1 つあるだけでビューポート外の図まで含めて 400KB 超を読み込む形にしないためである。
 * 実際にロードされるのは、図が 1 つでも画面に入ったときになる。
 *
 * 04.tech-stack/04-markdown.md §4 が課す 5 つの制約がそのままこのファイルの構造である。
 * 完全な動的 import / `IntersectionObserver` / 解放 / 1 図ずつ非同期 / 失敗時はコードブロック。
 */
import type mermaid from 'mermaid';

import { sanitizeSvg } from '@/markdown/sanitize';

import '@/styles/preview/mermaid.css';

/** 処理の状態。`data-mx-mermaid-state` として要素に付く。 */
const STATE = 'mxMermaidState';

type State = 'pending' | 'done' | 'error';

function stateOf(element: HTMLElement): State | undefined {
  return element.dataset[STATE] as State | undefined;
}

/**
 * 描画済み SVG のキャッシュ。キーはフェンスの中身そのものである。
 *
 * Split で編集している間、`live.ts` は打鍵ごと（debounce 120ms）に `paint` と `enhance` を呼ぶ。
 * キャッシュが無いと、本文のどこか 1 文字を直すたびにすべての図が再描画される。
 *
 * 上限を置いているのは、常駐アプリだからである（N-PERF-06）。
 * 文書を渡り歩くあいだ、開いたことのある図の SVG 文字列を無制限に保持することになる。
 */
const cache = new Map<string, string>();
const CACHE_LIMIT = 32;

/**
 * 要素ごとの元の記述。
 *
 * 描画に成功するとプレースホルダの中身は SVG に置き換わり、元の記述はどこにも残らない。
 * 配色が変わったときに再描画するにはそれが必要になる（`resetForTheme`）。
 * `WeakMap` にしてあるのは、`paint` が本文を差し替えた時点で要素ごと解放されるようにするためである。
 */
const sources = new WeakMap<HTMLElement, string>();

function remember(source: string, svg: string): void {
  // 先頭が最も古い（Map は挿入順を保つ）。
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(source, svg);
}

/** Mermaid 本体。最初の 1 図が画面に入った時点で解決する。 */
let engine: Promise<typeof mermaid> | null = null;

let observer: IntersectionObserver | null = null;
let unwatchTheme: (() => void) | null = null;

/** `id` の重複を避けるための連番。Mermaid は id を DOM とスタイルの両方に使う。 */
let sequence = 0;

/**
 * プレースホルダを監視の対象にする。`enhance` から呼ぶ。
 *
 * 呼ばれるたびに監視をやり直す。
 * `paint` は本文を差し替えるため、前回観測していた要素は既に DOM から外れている。
 * `IntersectionObserver` は観測対象を強く参照するため、入れ替えないとその要素が解放されない。
 *
 * 段階的描画では `enhance` が 2 回呼ばれるが、未描画のものを毎回すべて観測し直すため、1 回目の分が漏れることはない。
 */
export function observeMermaid(container: HTMLElement): void {
  const targets = [...container.querySelectorAll<HTMLElement>('.mx-mermaid')].filter(
    (element) => stateOf(element) === undefined,
  );

  observer?.disconnect();
  if (targets.length === 0) return;

  observer ??= new IntersectionObserver(onIntersect, {
    // 少し手前から描き始める。スクロールが止まってから描画が始まると、空白が見えている時間ができる。
    rootMargin: '200px',
  });

  for (const element of targets) observer.observe(element);
  watchTheme();
}

/**
 * 保持しているものをすべて解放する（N-PERF-06 / 04.tech-stack/04-markdown.md §4-3）。
 *
 * 呼ぶのは文書を閉じたときだけである。
 * `paint` のたびに呼ぶとキャッシュが毎回空になり、Split の編集中に全図が再描画される。
 */
export function disposeMermaid(): void {
  observer?.disconnect();
  observer = null;
  unwatchTheme?.();
  unwatchTheme = null;
  cache.clear();
  // Mermaid 本体の参照も解放する。次に必要になったときは import が解決済みのため、再取得のコストはほぼ無い。
  engine = null;
}

function onIntersect(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const element = entry.target;
    if (!(element instanceof HTMLElement)) continue;

    observer?.unobserve(element);
    void render(element);
  }
}

/**
 * Mermaid のテーマを図ごとに既定（明るい配色）へ固定する指定。
 *
 * `initialize` のテーマはモジュール全体の状態であり、書き出しのために切り替えると画面の図まで描き直しになる。
 * 図の先頭に置く指定は、その図にだけ効く。
 */
const LIGHT_DIRECTIVE = '%%{init: {"theme": "default"}}%%';

/**
 * 書き出し用の本文（`root`）にある図をすべて描く（F-VIEW-18）。
 *
 * `root` は画面とは別に描いた未処理の本文で、各図の中身は元の記述のままである。
 * `light` のときは画面の配色に関係なく明るい配色で描く（PDF / docs/06.roadmap/m8-cli-os-export.md §4.4）。
 * 描けなかった図はコードブロックとして残す（画面と同じ / N-REL-04）。
 */
export async function renderForExport(root: HTMLElement, light: boolean): Promise<void> {
  for (const element of root.querySelectorAll<HTMLElement>('.mx-mermaid')) {
    const source = element.textContent ?? '';
    if (source.trim() === '') continue;

    const cached = light ? undefined : cache.get(source);
    if (cached !== undefined) {
      element.innerHTML = cached;
      element.dataset[STATE] = 'done';
      continue;
    }

    sequence += 1;
    const id = `mx-mermaid-${sequence}`;
    // 1 図ずつ描く。Mermaid は描画のたびに `body` へ測定用の要素を置くため、並行すると片付けが干渉する（`removeScratch`）。
    try {
      // eslint-disable-next-line no-await-in-loop -- 上記
      const mermaid = await load();
      // eslint-disable-next-line no-await-in-loop -- 上記
      const { svg } = await mermaid.render(id, light ? `${LIGHT_DIRECTIVE}\n${source}` : source);
      element.innerHTML = sanitizeSvg(svg);
      // 状態の属性で中央寄せなどの見た目が決まる（`mermaid.css`）。
      element.dataset[STATE] = 'done';
    } catch {
      fallbackToCodeBlock(element, source);
    } finally {
      removeScratch(id);
    }
  }
}

/**
 * 図を 1 つ描く。
 *
 * `await` を挟むため、同じ要素に対して 2 回実行されないよう先に印を付ける。
 * 描画そのものは Mermaid が 1 図ずつ処理する形になっており、メインスレッドを長時間占有しない（§4-4）。
 */
async function render(element: HTMLElement): Promise<void> {
  if (stateOf(element) !== undefined) return;
  element.dataset[STATE] = 'pending';

  const source = element.textContent ?? '';
  if (source.trim() === '') {
    element.dataset[STATE] = 'done';
    return;
  }

  const cached = cache.get(source);
  if (cached !== undefined) {
    sources.set(element, source);
    element.innerHTML = cached;
    element.dataset[STATE] = 'done';
    return;
  }

  sequence += 1;
  const id = `mx-mermaid-${sequence}`;

  try {
    const mermaid = await load();
    const { svg } = await mermaid.render(id, source);

    // 描画のあいだに次の文書が開かれていることがある。切り離された要素には挿入しない。
    if (!element.isConnected) {
      delete element.dataset[STATE];
      return;
    }

    // Mermaid 自身も内部でサニタイズするが、それは Mermaid の許可リストであってこちらの許可リストではない。
    // 「DOM に入る HTML は必ず Layer 3 を通る」を例外なく適用する（ADR-0006 / §4 の注意書き）。
    const safe = sanitizeSvg(svg);
    remember(source, safe);
    sources.set(element, source);
    element.innerHTML = safe;
    element.dataset[STATE] = 'done';
  } catch {
    // 記述の誤りと、Mermaid 側の想定外の両方がここへ来る（N-REL-04）。
    fallbackToCodeBlock(element, source);
  } finally {
    removeScratch(id);
  }
}

/**
 * Mermaid が描画のために `body` へ置いた要素を片付ける。
 *
 * `render` は測定用の要素を `body` 直下に作る。
 * 成功時は自分で消すが、記述が誤っていたときは「Syntax error in text」の図を置いたまま残す。
 * 常駐アプリなので、消さないと本文の上にその図が重なったまま蓄積する。
 *
 * `d` 付きの id は Mermaid が内部で使う別名である。
 */
function removeScratch(id: string): void {
  for (const scratch of [document.querySelector(`#${id}`), document.querySelector(`#d${id}`)]) {
    // 本文の中に入れた図まで消さない。片付ける対象は `body` 直下に残ったものだけである。
    if (scratch?.parentElement === document.body) scratch.remove();
  }
}

/**
 * 描画できなかった図をコードブロックとして表示する（N-REL-04 / §4-5）。
 *
 * 空欄にはしない。中心ユースケースは「LLM が生成した Markdown を読む」ことであり、描画できない図の記述こそ、読んで修正する対象である。
 */
function fallbackToCodeBlock(element: HTMLElement, source: string): void {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  // `textContent` で入れるため、記述がどのような文字列でもここから HTML として解釈されることはない。
  code.textContent = source;
  pre.append(code);

  element.replaceChildren(pre);
  element.dataset[STATE] = 'error';
}

async function load(): Promise<typeof mermaid> {
  engine ??= initialize();
  return engine;
}

async function initialize(): Promise<typeof mermaid> {
  const module = await import('mermaid');
  module.default.initialize({
    // 自動描画は使わない。どの図をいつ描くかはこちら側が決める（§4-2）。
    startOnLoad: false,
    // `securityLevel` は Mermaid 側の防御。こちらの `sanitizeSvg` と二重に機能する。
    securityLevel: 'strict',
    theme: isDarkSurface() ? 'dark' : 'default',
    fontFamily: readToken('--mx-font-content'),
    // ラベルを SVG の `<text>` として出力させる。
    //
    // 既定では `<foreignObject>` の中の HTML になる。
    // `foreignObject` は mXSS の経路として知られており `sanitizeSvg` が除去するため、そのままではラベルが消えた図になる。
    // サニタイザの許可範囲を広げて対応することはしない（ADR-0006 の多層防御を弱めない）。
    //
    // 図種ごとの `flowchart.htmlLabels` では効果が無い。
    // Mermaid 11.17 では、そちらを false にしても `foreignObject` は出力され、`<text>` は空のまま残る。
    // 効果があるのはこの最上位のキーだけである。
    htmlLabels: false,
  });
  return module.default;
}

/** プレビュー面。配色はここに適用される（ADR-0013）。 */
function previewRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#mx-preview');
}

function readToken(name: string): string {
  const root = previewRoot() ?? document.documentElement;
  return getComputedStyle(root).getPropertyValue(name).trim();
}

/**
 * 明暗の判定。
 *
 * テーマ名ではなく解決後の背景色の明度で見る（`features/editor/lazy/theme.ts` と同じ理由）。
 * `theme` が `system` のときや配色でトークンを上書きしたとき、名前で判定する方法では誤る。
 */
function isDarkSurface(): boolean {
  const root = previewRoot();
  if (!root) return false;

  const matched = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(root).backgroundColor);
  if (!matched) return false;

  const [r, g, b] = [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/**
 * 配色の変更に追従する。
 *
 * Mermaid のテーマは `initialize` の時点で SVG に固定されるため、切り替えても再描画しなければ古い色のまま残る。
 * 監視するのは `<html>` の `data-theme`（F-CONF-01）、プレビュー面の `data-mx-theme`（F-CONF-08）、および OS 側の設定（`theme` が `system` のときは属性が付かない）である。
 */
function watchTheme(): void {
  if (unwatchTheme !== null) return;

  const observers: MutationObserver[] = [];
  const invalidate = () => resetForTheme();

  const root = new MutationObserver(invalidate);
  root.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  observers.push(root);

  const preview = previewRoot();
  if (preview) {
    const surface = new MutationObserver(invalidate);
    surface.observe(preview, { attributes: true, attributeFilter: ['data-mx-theme'] });
    observers.push(surface);
  }

  const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', invalidate);

  unwatchTheme = () => {
    for (const each of observers) each.disconnect();
    media.removeEventListener('change', invalidate);
  };
}

/**
 * 描画済みの図を破棄して再描画させる。
 *
 * キャッシュも Mermaid 本体の参照も破棄する。
 * `initialize` はモジュールの内部状態を書き換えるため、テーマを変えるには読み込み直すのが最も確実である。
 */
function resetForTheme(): void {
  cache.clear();
  engine = null;

  const container = previewRoot();
  if (!container) return;

  for (const element of container.querySelectorAll<HTMLElement>('.mx-mermaid')) {
    if (stateOf(element) !== 'done') continue;

    // 中身は SVG に置き換わっているので、元の記述へ戻してから未処理の状態に戻す。
    const source = sources.get(element);
    if (source === undefined) continue;
    element.textContent = source;
    delete element.dataset[STATE];
  }
  observeMermaid(container);
}
