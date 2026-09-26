/**
 * 保存（F-EDIT-02, 03, 14 / N-REL-01, 02）。
 *
 * 原子的書き込み・衝突検知・EOL/BOM の復元は Rust 側（`src-tauri/src/document/`）が済ませてあるため、ここの責務は WriteRequest の組み立て・結果の通知・`expectedMtimeMs` の更新の 3 つだけである。
 * mtime の更新を忘れると、外部の変更が無くても 2 回目の保存が必ず衝突として拒否される。
 * ダーティ状態は `dirty.ts` にある（依存の向きが違うため）。
 */
import { ja } from '@/i18n/ja';
import { getPlatform, type Eol, type SaveResult, type WriteRequest } from '@/platform';

import { markClean } from './dirty';
import { registerSaver } from './discard';
import { effectiveEol } from './eol';
import { describeOpenError, openPath } from './open';
import { documentStore, notifyStatus } from './store.svelte';
import { getDocumentText } from './text';

// 「保存してから別の文書へ移る」の実体を登録する（`discard.ts`）。
// こちらから登録するのは、`open.ts` がこのモジュールを import すると循環するためである。
registerSaver(() => saveCurrent());

/**
 * 保存する（`Ctrl+S`）。
 *
 * 何も開いていなければ何もしない。
 * ダーティでなくても保存するのは、操作しても反応が無い状態を避けるためである（内容が同じならディスク上のバイト列は変わらない）。
 */
export async function saveCurrent(): Promise<boolean> {
  const meta = documentStore.meta;
  if (meta === null) return false;

  // まだ一度も保存していない文書（`Ctrl+N` / `document/new.ts`）には保存先が無い。
  // `Ctrl+S` で保存先を尋ねるのは一般的なエディターと同じ挙動である（Familiar）。
  if (meta.path === null) return saveAs();

  return writeTo(meta.path, meta.mtimeMs);
}

/**
 * 名前を付けて保存（`Ctrl+Shift+S` / F-EDIT-02）。
 *
 * 保存先はまだ存在しないことがあるため、`expectedMtimeMs` には `null` を送る。
 * 既存のファイルを選んだ場合は衝突として返る（Rust 側の `write`）。
 * これは意図した挙動で、選んだファイルの内容を破棄してよいかは確認する価値がある。
 */
export async function saveAs(): Promise<boolean> {
  const meta = documentStore.meta;
  if (meta === null) return false;

  // 無題の文書には既定の保存先が無い。プラットフォーム側が既定の場所を選ぶ。
  const target = await getPlatform().pickSavePath(meta.path ?? '');
  if (target === null) return false;

  const saved = await writeTo(target, null);
  if (!saved) return false;

  // 保存できたら、そのファイルを開いている状態にする。
  // 開く経路は `open.ts` の 1 本だけであるため、ここでメタ情報を組み立てない。
  // 読み直すことで、正規化済みのパスと実際の mtime が得られる。
  await openPath(target, { resetScroll: false, history: false });
  return true;
}

/**
 * 実際に書く。衝突したら通知バーで選ばせる。
 *
 * `expected` が `null` なら新規作成として扱う（既存があれば衝突になる）。
 */
async function writeTo(path: string, expected: number | null): Promise<boolean> {
  const meta = documentStore.meta;
  if (meta === null) return false;

  // ステータスバーで変換を選んでいれば、その改行コードで書き戻す（`document/eol.ts`）。
  // 選んでいなければ読み込み時のままにする（N-CMP-03）。
  const eol = effectiveEol() ?? meta.eol;

  const request: WriteRequest = {
    path,
    // メモリ上は常に LF である。ディスクへ書き戻すときに `eol` と `bom` を使う（F-EDIT-14）。
    content: getDocumentText(),
    eol,
    bom: meta.bom,
    encoding: meta.encoding,
    expectedMtimeMs: expected,
  };

  let result: SaveResult;
  try {
    result = await getPlatform().writeDocument(request);
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.save.failed}: ${describeOpenError(e, path)}` };
    return false;
  }

  if (result.status === 'conflict') {
    offerConflictChoice(path, result.diskMtimeMs);
    return false;
  }

  applySaved(path, result.mtimeMs, result.size, eol);
  return true;
}

/**
 * 保存できた事実を反映する。
 *
 * `mtimeMs` の更新が要点である（モジュール冒頭のコメントを参照）。
 * `size` も併せて更新するのは、ステータスバーが古い値を表示したままにならないようにするためである。
 */
function applySaved(path: string, mtimeMs: number, size: number, eol: Eol): void {
  const meta = documentStore.meta;
  if (meta === null) return;

  // `eol` も更新する。変換して保存した場合、ディスク上の改行コードは新しいほうになっている。
  // 更新しないと、次に `markClean()` が変換の指定を破棄した時点でステータスバーの表示が古い改行コードへ戻る。
  documentStore.meta = { ...meta, path, mtimeMs, size, eol };
  markClean();
}

/**
 * 衝突したときの選択（03.ux-spec/07-status-and-notifications.md §2 の「警告」）。
 * 「保存できませんでした: 別のプロセスが変更しています」+ 上書き / 再読み込み、を消えない通知として出す。
 * データ消失に直結する選択なので、3 秒で消えて「無かったこと」になってはいけない。
 */
function offerConflictChoice(path: string, diskMtimeMs: number): void {
  documentStore.notice = {
    level: 'warning',
    message: ja.save.conflict,
    actions: [
      {
        label: ja.save.overwrite,
        // ディスク上の mtime を `expected` に設定し直して書き込む。
        // この選択が上書きの承諾にあたる。
        run: () => void writeTo(path, diskMtimeMs),
      },
      {
        label: ja.save.reloadInstead,
        // 編集内容は失われる。
        // それを了解したうえで選ぶための選択肢であり、選ばなければ何も起きない（通知は消えない）。
        run: () => void discardAndReload(path),
      },
    ],
  };
}

async function discardAndReload(path: string): Promise<void> {
  markClean();
  const outcome = await openPath(path, { resetScroll: false, remember: false, history: false });
  if (outcome) notifyStatus(ja.open.reloadedExternal);
}

/**
 * 「保存して終了」（F-EDIT-03 / `close.rs` の `ask_then_quit`）。
 *
 * 保存に失敗した場合は終了しない。
 * ダーティのままであるため、もう一度 `quitApp()` を呼んでも同じ確認が表示される。
 * 失敗を無視して終了する経路を作らないことが要件そのものである（N-REL-01）。
 */
export async function saveThenQuit(): Promise<void> {
  const saved = await saveCurrent();
  if (!saved) return;
  await getPlatform().quitApp();
}

/**
 * 「保存して閉じる」（F-OPEN-06 / `close.rs` の `ask_then_close`）。
 *
 * `saveThenQuit` と同じ構造で、保存した後の行き先だけが違う。
 * 他にウィンドウが残っているときの `✕` がここへ来る。
 * 保存に失敗した場合は閉じない（N-REL-01）。
 */
export async function saveThenCloseWindow(): Promise<void> {
  const saved = await saveCurrent();
  if (!saved) return;
  await getPlatform().closeWindow();
}

/** 保存の失敗を通知に出すためのラッパー。メニューとキーの両方から呼ばれる。 */
export async function saveSafely(): Promise<void> {
  try {
    await saveCurrent();
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.save.failed}: ${describeOpenError(e, '')}` };
  }
}

/** `saveAs` の失敗を通知に出すためのラッパー。 */
export async function saveAsSafely(): Promise<void> {
  try {
    await saveAs();
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.save.failed}: ${describeOpenError(e, '')}` };
  }
}
