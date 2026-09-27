// @vitest-environment jsdom
/**
 * コマンドパレットが「すべての機能への到達手段」であることを機械的に検証する（F-NAV-06 / Design Brief §14.4 の 2 アクション以内）。
 *
 * メニューバーを置かない以上、カタログへの登録漏れはその機能がキーを知っている人にしか使えなくなることを意味する。
 * 人の目では気づけないため、ここで突き合わせる。
 */
import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG, type CommandEntry } from './catalog';
import { fuzzyFilter } from './fuzzy';

/**
 * 一覧に出さないコマンドと、その理由。
 *
 * 理由を書ける場合だけここに追加する。
 * 空欄で通せる形にすると、登録漏れを見逃す原因になる。
 */
const NOT_LISTED: Record<string, string> = {
  'document.openPath': '対象を引数で取る。実行するのは最近開いたファイルの 1 件ごと',
  'tab.select': '対象（何番目か）を引数で取る。実行するのは Ctrl+1〜9',
};

describe('コマンドカタログ', () => {
  it('すべてのコマンドが載っている', async () => {
    // 実体の表を読む。`app/commands.ts` は feature を import するため、jsdom が要る。
    const { COMMAND_IDS } = await import('@/app/commands');

    const inCatalog = new Set(COMMAND_CATALOG.map((entry) => entry.id));
    const missing = COMMAND_IDS.filter((id) => !inCatalog.has(id) && !(id in NOT_LISTED));

    expect(missing).toEqual([]);
  });

  it('存在しないコマンドを載せていない', async () => {
    const { COMMAND_IDS } = await import('@/app/commands');
    const known = new Set<string>(COMMAND_IDS);

    expect(COMMAND_CATALOG.filter((entry) => !known.has(entry.id))).toEqual([]);
  });

  it('同じコマンドを二重に載せていない', () => {
    const ids = COMMAND_CATALOG.map((entry) => entry.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });
});

/**
 * 英語キーワード。
 *
 * ラベルは日本語しか無いため、書き漏らしたコマンドは `save` や `file` では出てこない。
 * 登録漏れと同じく人の目では気づけないため、ここで検証する。
 */
describe('英語キーワード', () => {
  it('すべてのコマンドが持っている', () => {
    expect(COMMAND_CATALOG.filter((entry) => entry.keywords.trim() === '')).toEqual([]);
  });

  it('半角小文字と空白だけでできている', () => {
    // 大文字・全角・日本語が混ざっても `fuzzyScore` の正規化が吸収するが、表記が揺れると同じ語を二通りで書いてしまう。書く側の形をここで 1 つに決める。
    const malformed = COMMAND_CATALOG.filter((entry) => !/^[a-z]+( [a-z]+)*$/.test(entry.keywords));
    expect(malformed.map((entry) => entry.id)).toEqual([]);
  });

  it('同じ語を重ねていない', () => {
    const duplicated = COMMAND_CATALOG.filter((entry) => {
      const words = entry.keywords.split(' ');
      return words.length !== new Set(words).size;
    });
    expect(duplicated.map((entry) => entry.id)).toEqual([]);
  });
});

/**
 * 英語キーワードで、実際のカタログのコマンドを引けることを確かめる。
 *
 * `fuzzy.test.ts` は仕組みだけを検証しており、語の書き漏らしはそちらでは分からない。
 * ここはコマンドパレットが渡すのと同じキー（ラベルと英語キーワード）で照合する。
 */
describe('パレットからの引き方', () => {
  const keysOf = (entry: CommandEntry): string[] => [
    typeof entry.label === 'function' ? entry.label() : entry.label,
    entry.keywords,
  ];

  it('ひらがなでカタカナのラベルに当たる', () => {
    expect(fuzzyFilter(COMMAND_CATALOG, 'ふぁいる', keysOf)[0]?.id).toBe('document.open');
  });

  it('英語でファイル操作のコマンドが並ぶ', () => {
    const ids = fuzzyFilter(COMMAND_CATALOG, 'file', keysOf).map((entry) => entry.id);

    expect(ids).toContain('document.open');
    expect(ids).toContain('document.save');
    expect(ids).not.toContain('preview.zoomIn');
  });

  it('英語で当たるのは語を書いたコマンドだけである', () => {
    expect(fuzzyFilter(COMMAND_CATALOG, 'zoom', keysOf).map((entry) => entry.id)).toEqual([
      'preview.zoomIn',
      'preview.zoomOut',
      'preview.zoomReset',
    ]);
  });
});
