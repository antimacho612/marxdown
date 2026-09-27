import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore, notifyStatus, STATUS_MESSAGE_MS } from './store.svelte';

/**
 * ストアが公開している状態の名前を集める。
 *
 * ルーンで宣言したフィールド（`meta` など）はインスタンスの own プロパティになり、手書きのアクセサ（`statusMessage`）はプロトタイプに置かれる。
 * 置き場所が 2 つに分かれるので、ADR-0005 の検証には両方を見る必要がある。
 * `#dismissTimer` のような private フィールドはどちらにも現れない（状態ではないので正しい）。
 */
function stateKeys(): string[] {
  const proto: object = Object.getPrototypeOf(documentStore);
  const inherited = Object.entries(Object.getOwnPropertyDescriptors(proto))
    .filter(([k, d]) => k !== 'constructor' && typeof d.get === 'function')
    .map(([k]) => k);
  return [...Object.getOwnPropertyNames(documentStore), ...inherited];
}

beforeEach(() => {
  documentStore.meta = null;
  documentStore.isDirty = false;
  documentStore.outline = [];
  documentStore.frontMatter = null;
  documentStore.stats = null;
  documentStore.textStats = null;
  documentStore.cursor = null;
  documentStore.eolOverride = null;
  documentStore.notice = null;
  // 代入すると自動消滅のタイマーも解除される
  documentStore.statusMessage = null;
});

describe('documentStore', () => {
  it('本文を保持するフィールドを持たない', () => {
    // ここに content / html が現れたら ADR-0005 違反。
    // 1 打鍵ごとに巨大な文字列がリアクティビティを通過し、入力レスポンス 16ms を満たせなくなる。
    const keys = stateKeys();
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('html');
    expect(keys).not.toContain('text');
    expect(keys).not.toContain('doc');
  });

  it('派生値だけを持つ', () => {
    expect(stateKeys().toSorted()).toEqual([
      'cursor',
      'eolOverride',
      'frontMatter',
      'isDirty',
      'meta',
      'notice',
      'outline',
      'stats',
      'statusMessage',
      'textStats',
    ]);
  });

  it('メタ情報を更新できる', () => {
    documentStore.meta = {
      path: 'C:/work/a.md',
      eol: 'crlf',
      bom: true,
      encoding: 'utf8',
      mtimeMs: 1,
      size: 10,
      readonly: false,
    };
    expect(documentStore.meta?.eol).toBe('crlf');
  });

  it('通知はひとつだけ保持する（積み上げない）', () => {
    documentStore.notice = { level: 'warning', message: 'a' };
    documentStore.notice = { level: 'error', message: 'b' };
    expect(documentStore.notice).toEqual({ level: 'error', message: 'b' });
  });
});

/** 自動で消える情報はステータスバーに出す。 */
describe('notifyStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('一時メッセージは既定の時間で消える', () => {
    notifyStatus('外部の変更を読み込みました');
    expect(documentStore.statusMessage).toBe('外部の変更を読み込みました');

    vi.advanceTimersByTime(STATUS_MESSAGE_MS);

    expect(documentStore.statusMessage).toBeNull();
  });

  it('通知バーは出しっぱなしにする（本文の上に重ねるものは操作するまで消さない）', () => {
    documentStore.notice = { level: 'error', message: '読み込めませんでした' };

    vi.advanceTimersByTime(STATUS_MESSAGE_MS * 10);

    expect(documentStore.notice?.message).toBe('読み込めませんでした');
  });

  it('一時メッセージは通知バーを消さない（別の面である）', () => {
    documentStore.notice = { level: 'error', message: '読み込めませんでした' };

    notifyStatus('再読み込みしました');

    expect(documentStore.notice?.message).toBe('読み込めませんでした');
  });

  it('自動消滅の待機中に差し替わったら、後から出たメッセージを消さない', () => {
    notifyStatus('古い');
    vi.advanceTimersByTime(STATUS_MESSAGE_MS - 1);
    notifyStatus('新しい');

    vi.advanceTimersByTime(STATUS_MESSAGE_MS - 1);

    expect(documentStore.statusMessage).toBe('新しい');
  });

  it('タイマーは 1 本しか走らない（ポーリングにしない / N-PERF-05）', () => {
    notifyStatus('a');
    notifyStatus('b');
    notifyStatus('c');
    expect(vi.getTimerCount()).toBe(1);
  });
});
