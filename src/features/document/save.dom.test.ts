// @vitest-environment jsdom
/**
 * 保存経路の回帰テスト（F-EDIT-02, 03, 14 / N-REL-01）。
 *
 * バイト列の正しさは Rust 側の担当（`src-tauri/src/document/`）で、UI からの通し確認は E2E の担当である（`e2e/`）。
 * この層が担うのは間の組み立てで、本文とメタ情報から `WriteRequest` を組む（EOL / BOM / encoding を落とさないか）ことと、`SaveResult` を画面の言葉と次の状態に変換する（mtime を更新し忘れないか）ことである。
 *
 * `mtime` の更新漏れは画面に出ない。
 * 2 回目の保存で初めて「別のプロセスが変更しています」として現れ、そのときには原因が遠い。
 * ここで固定しておく。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setPlatform, type DocumentMeta, type Platform, type SaveResult, type WriteRequest } from '@/platform';

import { documentStore } from './store.svelte';
import { resetDocumentText, setDocumentText } from './text';

const openPath = vi.fn((_path: string) => Promise.resolve({ parseMs: 0, paintMs: 0, chunks: 1 }));

/**
 * 開く経路はモックする。**ここで見たいのは保存の組み立て**であって、
 * パースと描画ではない（そちらは `open.dom.test.ts` の担当）。
 */
vi.mock('./open', () => ({
  openPath: (path: string) => openPath(path),
  describeOpenError: String,
}));

const { markClean, markDirty } = await import('./dirty');
const { saveAs, saveCurrent, saveThenQuit } = await import('./save');

const META: DocumentMeta = {
  path: 'C:/notes/a.md',
  eol: 'crlf',
  bom: true,
  encoding: 'shift-jis',
  mtimeMs: 1000,
  size: 10,
  readonly: false,
};

let writes: WriteRequest[] = [];
let result: SaveResult;
let dirtyReports: boolean[] = [];
let picked: string | null = null;
const quitApp = vi.fn(() => Promise.resolve());

function stubPlatform(): void {
  setPlatform({
    kind: 'web',
    writeDocument: (req: WriteRequest) => {
      writes.push(req);
      return Promise.resolve(result);
    },
    setDirty: (dirty: boolean) => {
      dirtyReports.push(dirty);
      return Promise.resolve();
    },
    pickSavePath: () => Promise.resolve(picked),
    quitApp,
  } as unknown as Platform);
}

beforeEach(() => {
  writes = [];
  dirtyReports = [];
  picked = null;
  result = { status: 'saved', mtimeMs: 2000, size: 20 };
  openPath.mockClear();
  quitApp.mockClear();
  resetDocumentText();
  documentStore.meta = { ...META };
  documentStore.isDirty = false;
  documentStore.eolOverride = null;
  documentStore.notice = null;
  stubPlatform();
});

describe('WriteRequest の組み立て (F-EDIT-14)', () => {
  it('読み込み時の EOL / BOM / エンコーディングをそのまま返す', async () => {
    // ここを落とすと、保存した瞬間に触っていない行まで差分になる（N-CMP-03）。
    setDocumentText('本文\n');
    await saveCurrent();

    expect(writes[0]).toEqual({
      path: META.path,
      content: '本文\n',
      eol: 'crlf',
      bom: true,
      encoding: 'shift-jis',
      expectedMtimeMs: 1000,
    });
  });

  it('EOL の変換を選んでいれば、そちらで書き戻す', async () => {
    // ステータスバーで CRLF → LF を選んだ状態（`document/eol.ts`）。
    setDocumentText('本文\n');
    documentStore.eolOverride = 'lf';
    await saveCurrent();

    expect(writes[0]?.eol).toBe('lf');
    // **ディスクの姿も新しいほうへ動かす。** ここを直さないと、保存の直後に
    // 希望が落ちた瞬間、ステータスバーの表示が CRLF へ戻る。
    expect(documentStore.meta?.eol).toBe('lf');
    expect(documentStore.eolOverride).toBeNull();
    expect(documentStore.isDirty).toBe(false);
  });

  it('いまの本文を送る（控えではなくエディタの内容）', async () => {
    setDocumentText('古い');
    setDocumentText('新しい');
    await saveCurrent();

    expect(writes[0]?.content).toBe('新しい');
  });

  it('何も開いていなければ書きに行かない', async () => {
    documentStore.meta = null;
    expect(await saveCurrent()).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe('保存に成功したとき', () => {
  it('mtime を更新する（更新しないと 2 回目が必ず衝突する）', async () => {
    setDocumentText('a');
    await saveCurrent();
    expect(documentStore.meta?.mtimeMs).toBe(2000);

    result = { status: 'saved', mtimeMs: 3000, size: 30 };
    await saveCurrent();
    expect(writes[1]?.expectedMtimeMs).toBe(2000);
  });

  it('サイズも更新する（ステータスバーが古い値を出し続けない）', async () => {
    await saveCurrent();
    expect(documentStore.meta?.size).toBe(20);
  });

  it('ダーティを解除する', async () => {
    markDirty();
    await saveCurrent();
    expect(documentStore.isDirty).toBe(false);
  });

  it('通知を出さない（うるさくしない）', async () => {
    await saveCurrent();
    expect(documentStore.notice).toBeNull();
  });
});

describe('衝突したとき (N-REL-02)', () => {
  beforeEach(() => {
    result = { status: 'conflict', diskMtimeMs: 9999 };
  });

  it('消えない警告を出し、上書きと再読み込みを選ばせる', async () => {
    await saveCurrent();

    const notice = documentStore.notice;
    expect(notice?.level).toBe('warning');
    expect(notice?.autoDismissMs).toBeUndefined();
    expect(notice?.actions?.map((a) => a.label)).toHaveLength(2);
  });

  it('ダーティのまま残す（黙って捨てない）', async () => {
    markDirty();
    await saveCurrent();
    expect(documentStore.isDirty).toBe(true);
  });

  it('「上書き」でディスクの mtime を据え直して書き直す', async () => {
    await saveCurrent();
    result = { status: 'saved', mtimeMs: 12_345, size: 5 };

    documentStore.notice?.actions?.[0]?.run();
    await vi.waitFor(() => expect(writes).toHaveLength(2));

    expect(writes[1]?.expectedMtimeMs).toBe(9999);
  });

  it('選ばなければ何も起きない', async () => {
    await saveCurrent();
    expect(writes).toHaveLength(1);
    expect(documentStore.notice).not.toBeNull();
  });
});

describe('ダーティ状態の通知 (F-EDIT-03)', () => {
  it('変わり目だけ Rust へ知らせる', async () => {
    markDirty();
    markDirty();
    markDirty();
    expect(dirtyReports).toEqual([true]);

    markClean();
    markClean();
    expect(dirtyReports).toEqual([true, false]);
  });
});

describe('名前を付けて保存 (F-EDIT-02)', () => {
  it('取り消したら何もしない', async () => {
    picked = null;
    expect(await saveAs()).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('新規作成として書く（expectedMtimeMs は null）', async () => {
    picked = 'C:/notes/b.md';
    await saveAs();
    expect(writes[0]?.expectedMtimeMs).toBeNull();
    expect(writes[0]?.path).toBe('C:/notes/b.md');
  });

  it('保存できたら、その先を開き直す', async () => {
    // 正規化済みのパスと実際の mtime は、読み直して初めて手に入る。
    picked = 'C:/notes/b.md';
    await saveAs();
    expect(openPath).toHaveBeenCalledWith('C:/notes/b.md');
  });

  it('衝突したら開き直さない', async () => {
    picked = 'C:/notes/b.md';
    result = { status: 'conflict', diskMtimeMs: 1 };
    await saveAs();
    expect(openPath).not.toHaveBeenCalled();
  });

  /**
   * 無題の文書（`Ctrl+N` / `document/new.ts`）には保存先が無い。
   * **`Ctrl+S` が名前を訊く**のが、どのエディタでも同じ振る舞いである（Familiar）。
   */
  it('まだ保存していない文書では、Ctrl+S が名前を訊きに行く', async () => {
    documentStore.meta = { ...META, path: null, mtimeMs: 0, size: 0 };
    picked = 'C:/notes/新規.md';
    setDocumentText('打った本文\n');

    expect(await saveCurrent()).toBe(true);

    expect(writes[0]?.path).toBe('C:/notes/新規.md');
    // 新規作成として書く。**既存ファイルを選んだ場合は衝突として返ってくる。**
    expect(writes[0]?.expectedMtimeMs).toBeNull();
    expect(writes[0]?.content).toBe('打った本文\n');
  });

  it('保存先を取り消したら、無題のままで何も書かない', async () => {
    documentStore.meta = { ...META, path: null, mtimeMs: 0, size: 0 };
    picked = null;

    expect(await saveCurrent()).toBe(false);

    expect(writes).toHaveLength(0);
    expect(documentStore.meta?.path).toBeNull();
  });
});

describe('保存して終了 (F-EDIT-03)', () => {
  it('保存できたら終了する', async () => {
    await saveThenQuit();
    expect(quitApp).toHaveBeenCalledTimes(1);
  });

  it('保存できなければ終了しない（N-REL-01）', async () => {
    result = { status: 'conflict', diskMtimeMs: 1 };
    await saveThenQuit();
    expect(quitApp).not.toHaveBeenCalled();
  });
});
