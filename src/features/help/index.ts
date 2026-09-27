/**
 * help feature の公開面（F-OS-09 / ADR-0027）。
 *
 * `main` に置くのは動的 import の入口だけである。
 * 不具合報告の URL の組み立て・「Marxdown について」のダイアログ・文言は `lazy/`（`help` チャンク）にあり、ヘルプの項目が選ばれるまで読み込まない。
 */

/** ヘルプの項目。`app/commands.ts` の `help.*` と 1 対 1 に対応する。 */
export type HelpAction = 'about' | 'reportIssue' | 'suggestFeature' | 'license' | 'thirdPartyNotices';

/** ヘルプの項目を実行する。`help` チャンクはここで初めて読み込まれる。 */
export async function runHelpLazily(action: HelpAction): Promise<void> {
  const { runHelp } = await import('./lazy/actions');
  await runHelp(action);
}
