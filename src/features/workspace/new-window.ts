/**
 * 別ウィンドウで開く（F-OPEN-06 / ADR-0004「1 プロセスが複数ウィンドウを持てる」）。
 *
 * 「別ウィンドウ」には意味の違う 2 つがある。
 *
 * サテライトは同じプロセスの中に増える窓で、タブと本文だけを持つ。
 * タブの右クリックと `Shift+Click` がここへ来る。状態（監視・許可スコープ・最近開いたファイル）はプロセス内で共有される。
 *
 * 新規インスタンスは独立したプロセスで、フルシェルの窓を持つ。
 * `Ctrl+Alt+N` と CLI の `-n`、Explorer の「新規ウィンドウで開く」がこちらである。何も共有しない。
 *
 * どちらも WebView ごと作られるため、タブを増やすのとはコストの桁が違う（ADR-0004 の Option C の欠点そのもの）。
 * 既定の導線はタブのままであり、ここは明示的に選んだときだけ通る経路である。
 */
import { documentStore, getDocumentText, type StoredMeta } from '@/features/document';
import { viewStore } from '@/features/view';
import { ja } from '@/i18n/ja';
import { getPlatform, type Eol, type ViewMode } from '@/platform';

import { closeTab, isTabDirty, tabMeta, tabsStore } from './tabs.svelte';

/**
 * 未保存のタブをサテライトへ渡すときの中身（F-OPEN-06 / 決定 1）。
 *
 * Rust はこれを解釈せず、JSON 文字列のまま運ぶ（`state.rs` の `transfer`）。
 * 受け取り側は `app/bootstrap.ts` で 1 回だけ引き取る。
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

/** 空の新しいインスタンスを起動する（`Ctrl+Alt+N`）。 */
export async function openNewInstance(): Promise<boolean> {
  return launch();
}

/**
 * パスをサテライトで開く（ファイルツリー / 本文中の相対リンクの `Shift+Click`）。
 *
 * いまのウィンドウのタブには手を触れない。
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
 * 同じファイルが 2 か所で開いていると、片方で編集して片方を保存したときにどちらが正しいのか決められなくなる
 * （`openPathInNewTab` が既存のタブへ切り替えるのと同じ理由）。
 *
 * サテライトが開けてから閉じる。
 * 逆にすると、ウィンドウの生成に失敗したときに行き先の無いままタブだけが消える。
 *
 * `position` はタブを窓の外へ落としたときに渡す（`TabStrip.svelte`）。
 * 落とした場所に出すことで、掴んで運んだものがそこに置かれたように見える。
 */
export async function moveTabToSatellite(id: number, position?: { x: number; y: number }): Promise<boolean> {
  const tab = tabsStore.tabs.find((t) => t.id === id);
  if (tab === undefined) return false;

  const meta = tabMeta(tab);
  const dirty = isTabDirty(tab);

  // ディスクと一致していて、開き直せるパスがあるなら、渡すのはパスだけで足りる。
  // そのほうが移した先の最初の描画が速く、本文が 2 か所のメモリに載る瞬間も作らない。
  if (!dirty && meta.path !== null) {
    // キーごと省く（`exactOptionalPropertyTypes` では `position: undefined` と「指定なし」が別物になる）。
    if (!(await spawnSatellite({ paths: [meta.path], mode: viewStore.mode, ...(position && { position }) })))
      return false;
    return closeTab(id, { remember: false });
  }

  // 未保存、または無題の文書。パスだけでは中身が失われるため、本文ごと渡す（決定 1 / N-REL-01）。
  const text = textOf(tab.id, tab.text);
  if (text === null) {
    documentStore.notice = { level: 'warning', message: ja.window.dirtyTab };
    return false;
  }

  const payload: TabTransfer = {
    meta,
    text,
    dirty,
    eolOverride: tab.eolOverride,
    scrollTop: tab.scrollTop,
  };

  let transfer: number;
  try {
    transfer = await getPlatform().stashTransfer(JSON.stringify(payload));
  } catch {
    documentStore.notice = { level: 'error', message: ja.window.failed };
    return false;
  }

  if (!(await spawnSatellite({ transfer, mode: viewStore.mode, ...(position && { position }) }))) return false;

  // 移した先に同じ内容が開いている。ここで破棄の確認を出すと、同じものを 2 回尋ねることになる。
  // 開き直せる一覧にも積まない。移動であって「閉じた」わけではない（`CloseTabOptions`）。
  return closeTab(id, { confirm: false, remember: false });
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

/**
 * 新しいプロセスを起動する。
 *
 * 成功はプロセスを起動できたところまでで、ウィンドウが出たかどうかまでは分からない（起動を待たないため）。
 */
async function launch(paths?: string[]): Promise<boolean> {
  try {
    await getPlatform().openNewInstance(paths ? { paths } : {});
    return true;
  } catch {
    documentStore.notice = { level: 'error', message: ja.window.failed };
    return false;
  }
}
