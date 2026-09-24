/**
 * 本文を DOM に入れる（02.architecture/06-markdown-rendering-pipeline.md §4）。
 *
 * 仮想スクロールは採用しない（ブラウザ内検索・アンカーリンク・印刷が壊れ、高さ推定の精度も出ないため）。
 * 代わりに、最初のチャンク（およそ 1 画面分）だけ即座に DOM へ入れ、残りを `requestIdleCallback` で順次追加する段階的描画で N-PERF-04 を満たす。
 */
import { requestIdle, type IdleDeadline } from '@/lib/idle';
import { LINE_HEAD } from '@/markdown/protocol';
import { sanitize } from '@/markdown/sanitize';

/** `paint` の結果。段階的描画の進み具合を呼び出し側へ伝える。 */
export interface PaintResult {
  /** 最初のチャンクが入った時刻（performance.now()）。 */
  firstChunkAt: number;
  /**
   * すべてのチャンクが入ったら解決する。
   *
   * 打ち切られた場合は解決しない。
   * 次の `paint()` が始まった時点で前の描画は不要になっており、続きを処理する呼び出し側も存在しない。
   */
  done: Promise<number>;
}

/**
 * 実行中の段階的描画。
 *
 * `paint()` は残りのチャンクを `requestIdle` で少しずつ入れるため、途中で次のファイルを開くと古いループが止まらない。
 * 未投入のチャンク文字列（`huge.md` で数 MB）と既に DOM から切り離された投入先要素を保持したまま処理を続けることになる。
 * タブを切り替えるたびに古いループが残るため、N-PERF-06 の前提としてここを止める必要がある。
 */
let running: { cancelled: boolean } | null = null;

/**
 * 差分更新（`patch`）の基準となる、最後に描画した本文。
 *
 * `blocks` を渡さずに描画した場合や、段階的描画を途中で打ち切った場合は、DOM との対応が取れないため `null` にする。
 */
let painted: { container: HTMLElement; blocks: readonly string[] } | null = null;

/**
 * 実行中の段階的描画を打ち切る。
 *
 * `paint()` の冒頭で呼ばれるため、通常は呼び出し側が意識する必要はない。
 * 本文を破棄するだけで再描画しない場面（タブを閉じる）のために公開している。
 */
export function cancelPaint(): void {
  if (running) {
    running.cancelled = true;
    painted = null;
  }
  running = null;
}

/**
 * チャンク列を container に描画する。
 *
 * 最初のチャンクは同期的に挿入する。
 * ここを非同期にすると、本文が読める最初のフレームが 1 フレーム遅れる。
 *
 * `blocks`（`ParseResult.blocks`）を渡すと、次の再描画で `patch` が差分だけを反映できるようになる。
 */
export function paint(
  container: HTMLElement,
  chunks: string[],
  frontMatter: string | null = null,
  blocks: readonly string[] | null = null,
): PaintResult {
  // 前の描画を先に停止する。
  // 停止しないと、古いループが DOM から切り離されたツリーへ追記し続ける（`running` のコメントを参照）。
  cancelPaint();
  container.replaceChildren();
  painted = blocks === null ? null : { container, blocks };

  // Front Matter は本文と一緒にスクロールするため、プレビューの中に挿入する（F-VIEW-09）。
  if (frontMatter !== null) container.append(frontMatterElement(frontMatter));

  const first = chunks[0];
  if (first === undefined) {
    const firstChunkAt = performance.now();
    return { firstChunkAt, done: Promise.resolve(firstChunkAt) };
  }

  // 本文幅の基準点（`.mx-content`）を 1 か所に限定する。
  // 見出しごとに font-size が異なっても、`ch` はここでしか計算されないため列幅が変わらない。
  const content = document.createElement('div');
  content.className = 'mx-content';
  container.append(content);
  content.append(toFragment(first));
  const firstChunkAt = performance.now();

  const rest = chunks.slice(1);
  if (rest.length === 0) {
    return { firstChunkAt, done: Promise.resolve(firstChunkAt) };
  }

  const token = { cancelled: false };
  running = token;

  const done = new Promise<number>((resolve) => {
    let index = 0;
    const step = (deadline: IdleDeadline) => {
      // 打ち切られたらその時点で処理を終える。Promise も解決しない。
      //
      // ここで `resolve` すると呼び出し側（`open.ts`）の `.then` が実行され、DOM から切り離されたコンテナに対して `enhance` とアンカーの復元を再度実行することになる。
      if (token.cancelled) return;

      // 1 回のアイドルで可能な限り挿入する。
      // 1 チャンクずつ処理すると、`huge.md` では idle コールバックの往復回数が支配的になる。
      do {
        const chunk = rest[index];
        if (chunk === undefined) break;
        content.append(toFragment(chunk));
        index++;
      } while (index < rest.length && (deadline.timeRemaining() > 4 || deadline.didTimeout));

      if (index < rest.length) {
        requestIdle(step);
        return;
      }
      // すべて挿入し終えた。
      // 自分が実行中の描画である場合にだけ `running` を解除する（既に次の `paint()` が始まっていれば、そちらを解除してはいけない）。
      if (running === token) running = null;
      resolve(performance.now());
    };
    requestIdle(step);
  });

  return { firstChunkAt, done };
}

/**
 * 再描画の差分だけを DOM に反映する（F-MODE-03 / #159）。
 *
 * `paint` は中身を空にしてから段階的に入れ直すため、途中の scrollHeight が足りずにスクロール位置が切り詰められる。
 * 処理済みの要素（ハイライト・数式・Mermaid・画像）も作り直しになり、高さが変わってプレビューが動く。
 * ここでは前回の `blocks` と比べ、内容が変わったブロックだけを同期的に差し替える。
 * 行番号だけが変わったブロック（上で改行を入れた場合）は `data-line` だけを書き換える。
 *
 * DOM との対応が取れないとき（前回の描画が途中で終わっている、生の HTML で要素の構造が変わった）は、全体を同期的に描画し直す。
 * どちらの場合も最後まで同期的に終わるため、途中の状態が画面に出ることはない。
 * 差し替えた要素には `enhance` を当て直す必要がある（処理済みの要素は対象外になる）。
 */
export function patch(
  container: HTMLElement,
  blocks: readonly string[],
  frontMatter: string | null,
): 'patched' | 'repainted' {
  if (tryPatch(container, blocks)) {
    syncFrontMatter(container, frontMatter);
    painted = { container, blocks };
    return 'patched';
  }

  const scrollTop = container.scrollTop;
  paint(container, blocks.length === 0 ? [] : [blocks.join('')], frontMatter, blocks);
  // NOTE: 同じタスク内で中身を入れ直すため、通常はレイアウトの時点で高さが戻っており位置は切り詰められない。
  // 保たれなかった場合に備えて、変わっていれば設定し直す。
  if (container.scrollTop !== scrollTop) container.scrollTop = scrollTop;
  return 'repainted';
}

function tryPatch(container: HTMLElement, blocks: readonly string[]): boolean {
  const base = painted;
  if (base === null || base.container !== container || running !== null) return false;

  const old = base.blocks;
  const content = container.querySelector<HTMLElement>(':scope > .mx-content');
  if (!content || old.length === 0 || blocks.length === 0) return false;

  const units = splitUnits([...content.childNodes], !LINE_HEAD.test(old[0] ?? ''));
  if (units === null || units.length !== old.length) return false;

  const max = Math.min(old.length, blocks.length);
  let head = 0;
  while (head < max && sameBlock(old[head], blocks[head], units[head])) head++;
  let tail = 0;
  while (
    tail < max - head &&
    sameBlock(old[old.length - 1 - tail], blocks[blocks.length - 1 - tail], units[units.length - 1 - tail])
  ) {
    tail++;
  }

  const added = blocks.slice(head, blocks.length - tail);
  const fragment = toFragment(added.join(''));
  const addedUnits = splitUnits([...fragment.childNodes], head === 0 && !LINE_HEAD.test(blocks[0] ?? ''));
  // 部分だけをパースしたことで要素の構造が変わった（閉じていない生の HTML が後続を取り込んだなど）。
  if (addedUnits === null || addedUnits.length !== added.length) return false;

  const next = units[units.length - tail]?.[0] ?? null;
  for (const node of units.slice(head, units.length - tail).flat()) node.remove();
  if (next) next.before(fragment);
  else content.append(fragment);
  return true;
}

const LINE_ATTR = /(\sdata-line=")(\d+)"/g;

/**
 * トップレベルのノード列を、`data-line` を持つ要素を先頭とするまとまりに分ける。
 *
 * `lead` が真なら、最初の `data-line` より前のノードを先頭のまとまりとする（空でもよい）。
 * 偽なのにそうしたノードがあれば、`blocks` との対応が取れないため `null` を返す。
 */
function splitUnits(nodes: ChildNode[], lead: boolean): ChildNode[][] | null {
  const units: ChildNode[][] = [];
  let current: ChildNode[] | null = null;
  if (lead) {
    current = [];
    units.push(current);
  }
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute('data-line')) {
      current = [node];
      units.push(current);
    } else if (current === null) {
      return null;
    } else {
      current.push(node);
    }
  }
  return units;
}

/**
 * 前回と同じブロックとして DOM を残せるか。
 *
 * 行番号だけが違う場合は、その場で `data-line` を新しい値に書き換えて真を返す。
 * 要素の数が合わなければ（処理済みの要素が構造を変えたなど）書き換えずに偽を返し、ブロックごと差し替えさせる。
 */
function sameBlock(before: string | undefined, after: string | undefined, nodes: ChildNode[] | undefined): boolean {
  if (before === undefined || after === undefined || nodes === undefined) return false;
  if (before === after) return true;
  if (before.replaceAll(LINE_ATTR, '$1"') !== after.replaceAll(LINE_ATTR, '$1"')) return false;

  const lines = Array.from(after.matchAll(LINE_ATTR), (match) => match[2] ?? '');
  const elements = nodes.flatMap((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const element = node as Element;
    const inner = [...element.querySelectorAll('[data-line]')];
    return element.hasAttribute('data-line') ? [element, ...inner] : inner;
  });
  if (elements.length !== lines.length) return false;

  for (const [index, element] of elements.entries()) element.setAttribute('data-line', lines[index] ?? '');
  return true;
}

/** Front Matter の表示を差分で合わせる。 */
function syncFrontMatter(container: HTMLElement, frontMatter: string | null): void {
  const current = container.querySelector<HTMLElement>(':scope > .mx-front-matter');
  if (frontMatter === null) {
    current?.remove();
  } else if (current) {
    if (current.textContent !== frontMatter) current.textContent = frontMatter;
  } else {
    container.prepend(frontMatterElement(frontMatter));
  }
}

/** `textContent` で入れるため、内容がどのような文字列でもここから HTML として解釈されることはない。 */
function frontMatterElement(frontMatter: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'mx-front-matter';
  pre.textContent = frontMatter;
  return pre;
}

/**
 * サニタイズ済み HTML を DocumentFragment にする。
 *
 * `innerHTML +=` を繰り返すと、既存の DOM が毎回破棄されて作り直される。
 * `<template>` 経由でパースしてから append することで、追記が O(追加分) になる。
 */
function toFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = sanitize(html);
  return template.content;
}
