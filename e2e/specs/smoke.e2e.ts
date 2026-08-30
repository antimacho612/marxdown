/**
 * ハーネスが成立していることの確認（OQ-29 / 06.roadmap/m2-editor.md §1.3）。
 *
 * **保存の検証そのものは、エディタが入る M2 Phase 2 で足す。**
 * ここが見るのは「起動しているインスタンスにファイルを開かせ、本文が画面に出る」
 * ところまでで、これが通らなければ以降のどのテストも書けない。
 *
 * 併せて、E2E からしか見られないことを確かめてある。
 * - argv 転送（ADR-0004）が実際に効いていること。**中心価値そのもの**
 * - 本文が `#mx-preview` に入っていること（`paint.ts` が直接 DOM に入れる経路）
 * - ディスクのバイト列を読み戻せること（N-CMP-03 の照合に使う道具立て）
 */
import { openViaForward } from '../helpers/app';
import { DEFAULT_FIXTURE, readBytes, toBytes, WORK_DOC } from '../helpers/fixtures';

describe('起動して本文が読める', () => {
  before(async () => {
    await openViaForward(WORK_DOC, '本文です。');
  });

  it('argv 転送で開いたファイルの見出しが描かれている', async () => {
    await expect($('#mx-preview .mx-content h1')).toHaveText('E2E');
  });

  it('ステータスバーが EOL とエンコーディングを表示している', async () => {
    // メタ情報が Rust から届いて派生状態に入っていることの確認。
    // 保存時の `WriteRequest` はこの値をそのまま返す（F-EDIT-14）。
    // 正規表現で見るのは、表示が大文字だから（`meta.encoding.toUpperCase()`）。
    // 文字列リテラルで書くと、エンコーディング名の大小を揃える lint と衝突する。
    await expect($('.mx-statusbar')).toHaveText(/UTF8[\s\S]*\bLF\b/);
  });

  it('開いただけではディスクのバイト列が変わらない', () => {
    // N-CMP-03 の下限。**読んだだけで書き戻していないこと**を、
    // ここで一度だけ固定しておく（保存の検証は Phase 2）。
    expect(readBytes(WORK_DOC).equals(toBytes(DEFAULT_FIXTURE))).toBe(true);
  });
});
