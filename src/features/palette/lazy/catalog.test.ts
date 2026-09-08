// @vitest-environment jsdom
/**
 * コマンドパレットが「すべての機能への到達手段」であることを機械で見張る
 * （F-NAV-06 / 03.ux-spec/01-screen-layout.md §3 / Design Brief §14.4 の 2 アクション以内）。
 *
 * メニューバーを置かない以上、カタログへの載せ忘れは**その機能がキーを知っている人にしか
 * 使えなくなる**ことを意味する。人の目では気づけないので、ここで突き合わせる。
 */
import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG } from './catalog';

/**
 * 一覧に出さないコマンドと、その理由。
 *
 * **理由を書ける場合だけここに足す。** 空欄で通せる形にすると、載せ忘れの逃げ道になる。
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
