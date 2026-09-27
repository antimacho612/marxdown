/**
 * タブを既にあるウィンドウへ移す・受け取る処理と、窓の外へ引き出している間の表示（OQ-43 / ADR-0017）。
 *
 * 遅延チャンクにある。
 * 読み込むのは、タブを窓の外へ出したとき・サテライトでタブの右クリックメニューを開いたとき・別のウィンドウからタブが届いたときだけである。
 *
 * 落とした先の判定とカーソルに追従する表示は Rust が担う（`src-tauri/src/tab_drag.rs` / `drag_ghost.rs`）。
 * 引き出した側はポインタを捕捉しているため、下にある他のウィンドウには何も届かない。
 */
import { documentStore } from '@/features/document';
import { t } from '@/i18n';
import { getPlatform, type Rgb, type TabArrival, type TabDragGhost } from '@/platform';

import {
  prepareHandoff,
  releaseMovedTab,
  restoreTransferredState,
  takeTabTransfer,
  type TabTransfer,
} from '../new-window';
import { closeTab, isTabDirty, openInNewTab, openPathsInTabs, tabMeta, tabsStore } from '../tabs.svelte';

/**
 * タブを既にあるウィンドウへ移す。
 *
 * 渡し終えてから閉じる。
 * 逆にすると、渡す先が見つからなかったときに行き先の無いままタブだけが消える（`moveTabToSatellite` と同じ判断）。
 */
export async function moveTabToWindow(id: number, target: string): Promise<boolean> {
  const tab = tabsStore.tabs.find((t) => t.id === id);
  if (tab === undefined) return false;

  const handoff = await prepareHandoff(tab);
  if (handoff === null) return false;

  try {
    await getPlatform().sendTabToWindow(target, handoff);
  } catch {
    documentStore.notice = { level: 'error', message: t.window.moveFailed };
    return false;
  }
  return releaseMovedTab(id);
}

/** 別のウィンドウから移されてきたタブを、このウィンドウのタブ列の末尾に加える。 */
export async function receiveTab(arrival: TabArrival): Promise<boolean> {
  if (arrival.transfer === null) return openPathsInTabs(arrival.paths);

  const transfer = await takeTabTransfer(arrival.transfer);
  return transfer === null ? false : adopt(transfer);
}

/**
 * 未保存か無題のタブを、本文ごと受け取る。
 *
 * 同じファイルのタブが既にあることがある（サテライトは既に開いているファイルでも開けるため / `openPathInSatellite`）。
 * 同じファイルが 2 枚並ぶと、どちらを保存すれば正しいのか決められなくなる（`openPathInNewTab`）。
 * 既にあるほうに未保存の変更が無ければ、そちらを閉じて移ってきたほうだけを残す。
 * 両方に未保存の変更があるときは、どちらも捨てずに並べる。後から保存したほうは衝突として検出される（N-REL-02）。
 */
async function adopt(transfer: TabTransfer): Promise<boolean> {
  const { path } = transfer.meta;
  // 開く前に探す。開いた後は移ってきたタブも同じパスを持つ。
  const same = path === null ? undefined : tabsStore.tabs.find((tab) => tabMeta(tab).path === path);

  const opened = await openInNewTab(
    { ...transfer.meta, content: transfer.text },
    { restoreScroll: transfer.scrollTop, remember: false },
  );
  if (!opened) return false;
  restoreTransferredState(transfer);

  if (same !== undefined && !isTabDirty(same)) await closeTab(same.id, { confirm: false, remember: false });
  return true;
}

/** 窓の外にいるか。`true` の間はカーソルに追従する表示が出ている。 */
let away = false;

/** 追従の指示を送っている最中か。前の指示が返るまで次を送らず、IPC を積み上げない。 */
let inFlight = false;

/** 送っている最中にポインタが動いた。返ったらもう 1 回だけ送る。 */
let behind = false;

/**
 * 指示の順序を保つ。
 * 開始より先に追従や終了が処理されると、消したはずの表示が残る。
 */
let queue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = after(queue, task);
  queue = settled(next);
  return next;
}

async function after<T>(previous: Promise<void>, task: () => Promise<T>): Promise<T> {
  await previous;
  return task();
}

/** 失敗しても次の指示は送る。待つのは順序のためだけである。 */
async function settled(task: Promise<unknown>): Promise<void> {
  try {
    await task;
  } catch {
    // 失敗は `enqueue` の呼び出し側が受け取る。
  }
}

/**
 * ポインタが窓の外にある。最初の 1 回で表示を出し、以後は追従させる。
 *
 * ポインタが動くたびに呼んでよい。
 */
export function trackOutside(tab: { name: string; dirty: boolean }): void {
  if (away) {
    void follow();
    return;
  }
  away = true;
  const ghost: TabDragGhost = {
    // 未保存の印も付ける。移した先でも未保存のまま届くことが、運んでいる間に分かる。
    label: tab.dirty ? `${tab.name} ●` : tab.name,
    colors: ghostColors(),
  };
  void enqueue(() => getPlatform().beginTabDrag(ghost)).catch(() => undefined);
}

/** ポインタが窓の中へ戻った。表示を消す。窓の中では並べ替えに戻る。 */
export function returnToWindow(): void {
  if (!away) return;
  away = false;
  behind = false;
  void enqueue(() => getPlatform().endTabDrag()).catch(() => null);
}

/**
 * 窓の外で離した。表示を消し、下にある他のウィンドウのラベルを返す。
 *
 * 他のウィンドウの上でなければ `null` を返す。呼び出し側はサテライトを作る。
 */
export async function dropOutside(): Promise<string | null> {
  away = false;
  behind = false;
  try {
    return await enqueue(() => getPlatform().endTabDrag());
  } catch {
    return null;
  }
}

async function follow(): Promise<void> {
  if (inFlight) {
    behind = true;
    return;
  }
  inFlight = true;
  try {
    await enqueue(() => getPlatform().moveTabDrag());
  } catch {
    // 追従が 1 回抜けるだけで、次に動いたときに追いつく。
  } finally {
    inFlight = false;
  }

  if (!behind) return;
  behind = false;
  if (away) await follow();
}

/**
 * 表示の配色。タブ（`TabStrip.svelte`）と同じトークンから取る。
 *
 * 窓の外の表示は Rust が描くため、CSS のトークンをそのまま渡せない。
 */
function ghostColors(): TabDragGhost['colors'] {
  const style = getComputedStyle(document.documentElement);
  return {
    background: toRgb(style.getPropertyValue('--mx-color-bg'), [255, 255, 255]),
    foreground: toRgb(style.getPropertyValue('--mx-color-fg'), [0, 0, 0]),
    border: toRgb(style.getPropertyValue('--mx-color-accent'), [0, 0, 0]),
  };
}

let probe: CanvasRenderingContext2D | null = null;

/**
 * CSS の色を sRGB の 3 値にする。
 *
 * 利用者の配色（`themes/`）はどの表記でも書けるため、文字列を解釈せず、1 画素塗って読み戻す。
 * 解釈できない値だった場合は `fallback` の色で塗られる。
 */
function toRgb(css: string, fallback: Rgb): Rgb {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (probe === null) return fallback;

  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = `rgb(${fallback.join(' ')})`;
  probe.fillStyle = css.trim();
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}
