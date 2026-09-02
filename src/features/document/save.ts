/**
 * 保存（F-EDIT-02, 03, 14 / N-REL-01, 02）。
 *
 * # ここが M2 で最も壊してはいけない経路
 *
 * 壊れたときの被害が「表示が崩れる」から **「ユーザーのファイルが壊れる」** に変わる。
 * 原子的書き込み・衝突検知・EOL/BOM の復元は **Rust 側が済ませてある**
 * （`src-tauri/src/document/`）ので、ここの責務は 3 つだけ。
 *
 * ```text
 * 1. いまの本文とメタ情報から WriteRequest を正しく組み立てる
 * 2. 返ってきた結果（saved / conflict）を画面の言葉に落とす
 * 3. 保存できた事実を、次の保存が使う形（mtime）へ反映する
 * ```
 *
 * # 3 が抜けると、自分の保存が次の衝突になる
 *
 * `expectedMtimeMs` は「前回読んだ / 書いた時点のディスクの姿」である。
 * 保存に成功したのに更新し忘れると、**2 回目の `Ctrl+S` が必ず衝突する。**
 * 外から誰も触っていないのに「別のプロセスが変更しています」が出る。
 *
 * ダーティ状態そのものは `dirty.ts` にある（依存の向きが違うため）。
 */
import { ja } from '@/i18n/ja';
import { toMessage } from '@/lib/error';
import { getPlatform, type Eol, type SaveResult, type WriteRequest } from '@/platform';

import { markClean } from './dirty';
import { registerSaver } from './discard';
import { effectiveEol } from './eol';
import { describeOpenError, openPath } from './open';
import { documentStore, notifyInfo } from './store.svelte';
import { getDocumentText } from './text';

// 「保存してから別の文書へ移る」の実体を渡す（`discard.ts`）。
// **こちらから名乗り出る。** `open.ts` がここを import すると循環する。
registerSaver(() => saveCurrent());

/**
 * 保存する（`Ctrl+S`）。
 *
 * 何も開いていなければ何もしない。**ダーティでなくても保存する**のは、
 * 「押したのに何も起きない」を避けるため（ディスクの内容は変わらないので害が無い）。
 */
export async function saveCurrent(): Promise<boolean> {
  const meta = documentStore.meta;
  if (meta === null) return false;

  // まだ一度も保存していない文書（`Ctrl+N` / `document/new.ts`）には保存先が無い。
  // **`Ctrl+S` で名前を訊く**のが、どのエディタでも同じ振る舞いである（Familiar）。
  if (meta.path === null) return saveAs();

  return writeTo(meta.path, meta.mtimeMs);
}

/**
 * 名前を付けて保存（`Ctrl+Shift+S` / F-EDIT-02）。
 *
 * 保存先はまだ存在しないことがあるので、`expectedMtimeMs` は `null` を送る。
 * **既存のファイルを選んだ場合は衝突として返ってくる**（Rust 側の `write`）。
 * それでよい。上書きの確認をもう一度出すことになるが、
 * 「選んだファイルを消してよいか」は確かに確認に値する。
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
  // **開く経路は 1 本しかない**（`open.ts`）ので、ここでメタ情報を組み立てない。
  // 読み直すことで、正規化済みのパスと実際の mtime が手に入る。
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

  // ステータスバーで変換を選んでいれば、そちらで書き戻す（`document/eol.ts`）。
  // **選んでいなければ読み込み時のまま**（N-CMP-03）。
  const eol = effectiveEol() ?? meta.eol;

  const request: WriteRequest = {
    path,
    // **メモリ上は LF。** ディスクへ戻すときに `eol` と `bom` が使われる（F-EDIT-14）。
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
 * **`mtimeMs` の更新が要点**（このモジュールのコメント参照）。`size` も併せて直すのは、
 * ステータスバーが古い値を出したままにならないようにするため。
 */
function applySaved(path: string, mtimeMs: number, size: number, eol: Eol): void {
  const meta = documentStore.meta;
  if (meta === null) return;

  // **`eol` も書き戻す。** 変換して保存したなら、ディスクの姿はもう新しいほうである。
  // ここを直さないと、次に `markClean()` が希望を落とした瞬間に
  // ステータスバーの表示が古い改行コードへ戻る。
  documentStore.meta = { ...meta, path, mtimeMs, size, eol };
  markClean();
}

/**
 * 衝突したときの選択（03.ux-spec/07-status-and-notifications.md §2 の「警告」）。
 *
 * ```text
 * 「保存できませんでした: 別のプロセスが変更しています」+ 上書き / 再読み込み
 * ```
 *
 * **消えない通知にする。** データ消失に直結する選択なので、
 * 3 秒で消えて「無かったこと」になってはいけない。
 */
function offerConflictChoice(path: string, diskMtimeMs: number): void {
  documentStore.notice = {
    level: 'warning',
    message: ja.save.conflict,
    actions: [
      {
        label: ja.save.overwrite,
        // ディスクの姿を `expected` に据え直して書き直す。
        // **ここで初めて、ユーザーが「上書きしてよい」と言ったことになる。**
        run: () => void writeTo(path, diskMtimeMs),
      },
      {
        label: ja.save.reloadInstead,
        // **編集内容は失われる。** それを承知で選ぶための選択肢であり、
        // 選ばなければ何も起きない（通知は消えない）。
        run: () => void discardAndReload(path),
      },
    ],
  };
}

async function discardAndReload(path: string): Promise<void> {
  markClean();
  const outcome = await openPath(path, { resetScroll: false, remember: false, history: false });
  if (outcome) notifyInfo(ja.open.reloadedExternal);
}

/**
 * 「保存して終了」（F-EDIT-03 / `close.rs` の `ask_then_quit`）。
 *
 * **保存に失敗したら終了しない。** ダーティのままなので、もう一度 `quitApp()` を
 * 呼んでも同じ確認が出る。失敗を握り潰して終わる経路を作らないことが要件そのもの
 * （N-REL-01）。
 */
export async function saveThenQuit(): Promise<void> {
  const saved = await saveCurrent();
  if (!saved) return;
  await getPlatform().quitApp();
}

/** 保存の失敗をそのまま通知に出すためのラッパ。メニューとキーの両方から呼ばれる。 */
export async function saveSafely(): Promise<void> {
  try {
    await saveCurrent();
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.save.failed}: ${toMessage(e)}` };
  }
}

export async function saveAsSafely(): Promise<void> {
  try {
    await saveAs();
  } catch (e) {
    documentStore.notice = { level: 'error', message: `${ja.save.failed}: ${toMessage(e)}` };
  }
}
