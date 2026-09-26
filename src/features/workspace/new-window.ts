/**
 * 別ウィンドウ（サテライト）で開く（F-OPEN-06 / ADR-0004「1 プロセスが複数ウィンドウを持てる」）。
 *
 * サテライトは同じプロセスの中に増える窓で、タブと本文だけを持つ。
 * タブの右クリックと `Shift+Click` がここへ来る。状態（監視・許可スコープ・最近開いたファイル）はプロセス内で共有される。
 * 独立したプロセスで開く経路は廃止した（ADR-0019）。
 *
 * WebView ごと作られるため、タブを増やすのとはコストの桁が違う（ADR-0004 の Option C の欠点そのもの）。
 * 既定の導線はタブのままであり、ここは明示的に選んだときだけ通る経路である。
 */
import { documentStore, getDocumentText, setDirty, type StoredMeta } from '@/features/document';
import { viewStore } from '@/features/view';
import { ja } from '@/i18n/ja';
import { getPlatform, type Eol, type ViewMode } from '@/platform';

import { closeTab, isTabDirty, tabMeta, tabsStore, type Tab } from './tabs.svelte';

/**
 * 未保存のタブをサテライトへ渡すときの中身（F-OPEN-06 / ADR-0016 §3.4）。
 *
 * Rust はこれを解釈せず、JSON 文字列のまま運ぶ（`state.rs` の `transfer`）。
 * 受け取り側は `takeTabTransfer` で 1 回だけ引き取る。
 */
export interface TabTransfer {
  meta: StoredMeta;
  text: string;
  /** ディスクと違う内容か。移した先でも未保存の印（`●`）が出る。 */
  dirty: boolean;
  /** 保存時に書き戻す EOL の希望（F-EDIT-14）。移さないと、移した先で保存したときに改行コードが戻る。 */
  eolOverride: Eol | null;
  /** Preview のスクロール位置。移しても同じ位置から読み始められるようにする。 */
  scrollTop: number;
}

/**
 * パスをサテライトで開く（ファイルツリー / 本文中の相対リンクの `Shift+Click`）。
 *
 * いまのウィンドウのタブは変更しない。
 * 移動ではなく「もう 1 枚開く」操作であり、既に開いているファイルでもサテライトに現れる。
 *
 * 表示モードは引き継がない。
 * 「この 1 枚を読みたい」という操作であり、いまエディターを開いていることとは関係がない。
 */
export async function openPathInSatellite(path: string): Promise<boolean> {
  return spawnSatellite({ paths: [path] });
}

/**
 * タブをサテライトへ移す。
 *
 * 移動であって複製ではない。
 * 同じファイルが 2 か所で開いていると、片方で編集して片方を保存したときにどちらが正しいのか決められなくなる（`openPathInNewTab` が既存のタブへ切り替えるのと同じ理由）。
 *
 * サテライトが開けてから閉じる。
 * 逆にすると、ウィンドウの生成に失敗したときに行き先の無いままタブだけが消える。
 *
 * `position` はタブを窓の外へドロップしたときに渡す（`TabStrip.svelte`）。
 * ドロップした場所に出すことで、ドラッグしたものがそこに置かれたように見える。
 */
export async function moveTabToSatellite(id: number, position?: { x: number; y: number }): Promise<boolean> {
  const tab = tabsStore.tabs.find((t) => t.id === id);
  if (tab === undefined) return false;

  const handoff = await prepareHandoff(tab);
  if (handoff === null) return false;

  // `position` はキーごと省く（`exactOptionalPropertyTypes` では `position: undefined` と「指定なし」が別物になる）。
  if (!(await spawnSatellite({ ...handoff, mode: viewStore.mode, ...(position && { position }) }))) return false;
  return releaseMovedTab(id);
}

/**
 * 移す先へ渡すもの（ADR-0016 §3.4）。どちらか一方だけを持つ。
 *
 * サテライトを作るとき（`openSatellite`）と、既にあるウィンドウへ移すとき（`sendTabToWindow`）で同じ形を使う。
 */
export type Handoff = { paths: string[] } | { transfer: number };

/**
 * タブを渡す準備をする。渡せなければ通知を出して `null` を返す。
 *
 * ディスクと一致していて開き直せるパスがあるなら、渡すのはパスだけで足りる。
 * そのほうが移した先の最初の描画が速く、本文が 2 か所のメモリに存在する瞬間も作らない。
 * 未保存か無題の文書は、パスだけでは中身が失われるため本文ごと受け渡し箱へ預ける（N-REL-01）。
 */
export async function prepareHandoff(tab: Tab): Promise<Handoff | null> {
  const meta = tabMeta(tab);
  const dirty = isTabDirty(tab);
  if (!dirty && meta.path !== null) return { paths: [meta.path] };

  const text = textOf(tab.id, tab.text);
  if (text === null) {
    documentStore.notice = { level: 'warning', message: ja.window.textUnavailable };
    return null;
  }

  const payload: TabTransfer = {
    meta,
    text,
    dirty,
    eolOverride: tab.eolOverride,
    scrollTop: tab.scrollTop,
  };

  try {
    return { transfer: await getPlatform().stashTransfer(JSON.stringify(payload)) };
  } catch {
    documentStore.notice = { level: 'error', message: ja.window.failed };
    return null;
  }
}

/**
 * 渡し終えたタブを閉じる。
 *
 * 移した先に同じ内容が開いている。ここで破棄の確認を出すと、同じものを 2 回尋ねることになる。
 * 開き直せる一覧にも加えない。移動であって「閉じた」わけではない（`CloseTabOptions`）。
 */
export async function releaseMovedTab(id: number): Promise<boolean> {
  return closeTab(id, { confirm: false, remember: false });
}

/**
 * 受け渡し箱から本文を引き取る（ADR-0016 §3.4）。1 回しか取れない。
 *
 * 取れなかった場合（既に引き取り済み / ID の不一致 / 壊れた中身）は通知を出して `null` を返す。
 * サテライトの起動（`app/bootstrap.ts`）と、既にあるウィンドウへ移されてきたとき（`lazy/handoff.ts`）が使う。
 */
export async function takeTabTransfer(id: number): Promise<TabTransfer | null> {
  try {
    const raw = await getPlatform().takeTransfer(id);
    return raw === null ? null : (JSON.parse(raw) as TabTransfer);
  } catch {
    documentStore.notice = { level: 'error', message: ja.window.moveFailed };
    return null;
  }
}

/**
 * 移してきた文書を開いた後に、未保存の状態を戻す。
 *
 * `openDocument` はディスクと一致した状態から始める（`markClean`）ため、開いた後に呼ぶ。
 * EOL の希望を先に戻すのは、`setDirty` が合成後の値を出し直すためである（`tabs.svelte.ts` の `activateTab` と同じ順序）。
 */
export function restoreTransferredState(transfer: Pick<TabTransfer, 'dirty' | 'eolOverride'>): void {
  documentStore.eolOverride = transfer.eolOverride;
  setDirty(transfer.dirty);
}

/**
 * そのタブの本文。取り出せなければ `null`。
 *
 * 表示中のタブの本文はエディター（またはその受け皿）にあり、非アクティブのタブは退避してある値を持つ（`Tab.text`）。
 * 退避してあるのは未保存の変更と無題の文書だけなので、ここへ来る時点で片方は必ず埋まっている。
 */
function textOf(id: number, held: string | null): string | null {
  if (tabsStore.activeId === id && tabsStore.loadedId === id) return getDocumentText();
  return held;
}

/** いま表示しているタブをサテライトへ移す。コマンド表から呼ぶ。 */
export async function moveCurrentTabToSatellite(): Promise<boolean> {
  const id = tabsStore.activeId;
  if (id === null) return false;
  return moveTabToSatellite(id);
}

/**
 * 失敗を通知に変える。
 *
 * ウィンドウが 1 枚も増えないという結果は画面から読み取れないため、黙って失敗させない。
 * 起きうるのは OS 側の上限や WebView の初期化の失敗であり、こちらから回復する手段は無い。
 */
async function spawnSatellite(options: {
  paths?: string[];
  transfer?: number;
  mode?: ViewMode;
  position?: { x: number; y: number };
}): Promise<boolean> {
  try {
    await getPlatform().openSatellite(options);
    return true;
  } catch {
    documentStore.notice = { level: 'error', message: ja.window.failed };
    return false;
  }
}
