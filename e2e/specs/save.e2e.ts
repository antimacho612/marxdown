/**
 * 保存経路（F-EDIT-02, 14 / N-REL-01, 02 / N-CMP-03）。
 *
 * 単体テストでは「エディターの内容 → `WriteRequest` → IPC → ディスクのバイト列」を通しで確かめられない。
 * 1 文字だけ編集して保存したときに git diff が 1 行だけになることと、保存の衝突を意図的に起こしてもデータが失われないことは、ここでしか検証できない。
 *
 * 照合は必ず `Buffer` で行う。
 * 文字列で比べると、CRLF が LF に変わったことも BOM が失われたことも通ってしまう（`helpers/fixtures.ts`）。
 */
import { Key } from 'webdriverio';

import {
  clickNoticeAction,
  editorText,
  enterEditMode,
  isDirtyShown,
  noticeText,
  openViaForward,
  saveAndWaitClean,
  typeAtEnd,
  waitForEditorText,
  waitForNotice,
} from '../helpers/app';
import { readBytes, toBytes, WORK_DOC, writeFile, type FixtureShape } from '../helpers/fixtures';

/** ディスクの内容を入れ替え、アプリが読み直すまで待つ。Clean のときだけ自動で読まれる。 */
async function replaceOnDiskAndWait(shape: FixtureShape, expected: string): Promise<void> {
  writeFile(WORK_DOC, shape);
  await waitForEditorText(expected);
}

/**
 * 開くのは 1 回だけ。
 *
 * spec ファイル 1 つにつきセッションは 1 つで、アプリも 1 つ。
 * describe ごとに開き直そうとすると、前の describe が書き換えた内容を探すことになり整合しない。
 * 必要な出発点は、その場でディスクへ書いて読み直させる（`replaceOnDiskAndWait`）。
 */
before(async () => {
  await openViaForward(WORK_DOC, '本文です。');
  await enterEditMode();
});

describe('保存', () => {
  it('打つと未保存の印が出る (F-EDIT-03)', async () => {
    expect(await isDirtyShown()).toBe(false);

    await typeAtEnd('X');
    await browser.waitUntil(() => isDirtyShown(), { timeout: 10_000, timeoutMsg: '印が出なかった' });
  });

  it('保存すると印が消え、打った内容がディスクに載る', async () => {
    await saveAndWaitClean();

    const expected: FixtureShape = { content: '# E2E\n\n本文です。\nX', eol: 'lf', bom: false };
    expect(readBytes(WORK_DOC).equals(toBytes(expected))).toBe(true);
  });

  it('2 回目の保存も衝突しない（mtime を更新し忘れていない）', async () => {
    // 更新漏れは画面に出ない。
    // 1 回目は通り、2 回目で初めて「別のプロセスが変更しています」として現れる（`features/document/save.ts`）。
    await typeAtEnd('Y');
    await saveAndWaitClean();

    const expected: FixtureShape = { content: '# E2E\n\n本文です。\nXY', eol: 'lf', bom: false };
    expect(readBytes(WORK_DOC).equals(toBytes(expected))).toBe(true);
    expect(await noticeText()).not.toContain('別のプロセス');
  });
});

describe('CRLF と BOM を保つ (F-EDIT-14 / N-CMP-03)', () => {
  before(async () => {
    // ダーティでないので、外部変更は確認なしで読み直される。
    await replaceOnDiskAndWait({ content: '# CRLF\n\n本文\n', eol: 'crlf', bom: true }, 'CRLF');
  });

  it('CRLF + BOM のファイルを編集して保存しても、その姿のまま', async () => {
    // これが N-CMP-03 の中核。
    // 改行コードを勝手に正規化すると、1 文字直しただけで git diff が全行変更になる。
    await typeAtEnd('Z');
    await saveAndWaitClean();

    const expected: FixtureShape = { content: '# CRLF\n\n本文\nZ', eol: 'crlf', bom: true };
    const actual = readBytes(WORK_DOC);

    expect(actual.equals(toBytes(expected))).toBe(true);
    // 念のため、バイト列そのものも確認する（比較が偶然通っていないこと）
    expect(actual.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    expect(actual.includes(Buffer.from('\r\n'))).toBe(true);
  });
});

describe('保存の衝突 (N-REL-01, N-REL-02)', () => {
  before(async () => {
    await replaceOnDiskAndWait({ content: '# 衝突\n\n本文\n' }, '衝突');
  });

  it('編集中に外部変更が来ても、黙って読み直さない', async () => {
    await typeAtEnd('編集中');
    await browser.waitUntil(() => isDirtyShown(), { timeout: 10_000 });

    writeFile(WORK_DOC, { content: '# 外から\n\n書き換えた\n' });

    await waitForNotice('外部で変更されました');

    // 打った内容がまだ画面にあることが要件そのもの（N-REL-02）。
    expect(await editorText()).toContain('編集中');
  });

  it('そのまま保存しようとすると衝突として弾かれ、ディスクは変わらない', async () => {
    const before = readBytes(WORK_DOC);

    await browser.keys([Key.Control, 's']);
    await waitForNotice('別のプロセス');

    // 拒否された以上、ディスクは 1 バイトも変わっていないこと（N-REL-01）。
    expect(readBytes(WORK_DOC).equals(before)).toBe(true);
    // 未保存のままであること。ここが false になると、保存できていないのに保存できたように見える。
    expect(await isDirtyShown()).toBe(true);
  });

  it('「上書き」を選ぶと、こちらの内容で書き換わる', async () => {
    await clickNoticeAction('上書き');

    await browser.waitUntil(async () => !(await isDirtyShown()), {
      timeout: 20_000,
      timeoutMsg: '上書きしても未保存の印が消えなかった',
    });

    const saved = readBytes(WORK_DOC).toString('utf8');
    expect(saved).toContain('編集中');
    expect(saved).not.toContain('書き換えた');
  });
});
