/**
 * 配色の一覧と適用（ADR-0014 / `theme` チャンク）。
 *
 * 組み込みの 50 枚（`presets.ts`）とユーザーが `themes/` に置いたファイルを 1 つのカタログとして扱い、面ごとに選ばれている 1 枚だけを注入する。
 * 50 枚ぶんの CSS を常に流し込んでいるわけではない。
 *
 * カタログはプレビューとエディターで共通である。
 * どちらも `--mx-color-*` の上書きでしかなく、面を分けているのは属性だけである（`../inject.ts`）。
 *
 * このチャンクを読み込むのは、既定以外の配色が選ばれているか、エディターか設定ダイアログを開いたときだけである。
 * プレビューで `themes/` の 1 枚を選んでいる場合は bootstrap に宣言が含まれるため、ここを待たずに適用される（`../index.ts`）。
 */
import { getPlatform, type UserTheme } from '@/platform';

import { clearTheme, injectTheme, type ApplyResult, type Surface } from '../inject';
import { declarations, type Preset, type ThemeSummary } from './preset';
import { PRESETS } from './presets';

/** 配色を選んでいない状態。属性を付けず、`tokens.css` のトークンをそのまま使う（F-CONF-02）。 */
const DEFAULT_ID = 'default';

/**
 * `themes/` から読み込んだもの。id で引く。
 *
 * 起動のたびに読み直すため永続化はしない。
 * 空のままでも組み込みの 50 枚は選べる（Tauri の外で動かす `pnpm dev:web` がその状態にあたる）。
 */
const userThemes = new Map<string, UserTheme>();

export type { ApplyResult } from '../inject';

/**
 * `themes/` を読み直す。ファイルが 1 枚も無い状態は正常であり、失敗として扱わない。
 *
 * 適用し直しは行わない。呼び出し側が続けて `applyTheme` を呼ぶ。
 * 読み直しと適用を 1 つにすると、起動直後（まだ何も適用していない）と外部変更（適用中のものがある）で別の関数が要る形になる。
 */
export async function refreshUserThemes(): Promise<void> {
  let loaded: readonly UserTheme[];
  try {
    loaded = await getPlatform().listUserThemes();
  } catch {
    // 読めなかったことは通知しない。組み込みの配色は選べるままである。
    return;
  }

  userThemes.clear();
  for (const theme of loaded) userThemes.set(theme.id, theme);
}

/**
 * 選択の一覧。色は含まない（`ThemeSummary`）。
 *
 * 同じ id が両方にあればユーザー側を採る。
 * 組み込みの配色を自分の好みへ差し替える手段がこれで、設定を書き換えずに済む。
 */
export function listThemes(): ThemeSummary[] {
  const summaries: ThemeSummary[] = [];

  for (const [id, theme] of userThemes) {
    summaries.push(summary(id, id, schemeOf(theme.declarations), true));
  }
  for (const [id, preset] of Object.entries(PRESETS) as [string, Preset][]) {
    if (userThemes.has(id)) continue;
    summaries.push(summary(id, preset.label, preset.scheme, false));
  }

  return summaries;
}

/**
 * 1 件ぶんの要約。
 *
 * 明暗を持たない配色では `scheme` のキーごと省く。
 * `exactOptionalPropertyTypes` の下では `scheme: undefined` を書くこと自体が型エラーになる。
 */
function summary(id: string, label: string, scheme: 'light' | 'dark' | undefined, user: boolean): ThemeSummary {
  return scheme === undefined ? { id, label, user } : { id, label, scheme, user };
}

/**
 * 選ばれている配色を面に適用する。同期的に完了する。
 *
 * 属性そのものを付けるのは `features/settings/appearance.ts` で、ここは属性に対応する規則を用意するだけである。
 * 分かれているのは、属性が起動直後（`main`）に付き、規則はこのチャンクが読み込まれるまで存在しないためである。
 *
 * 知らない id は既定に置き換えず、何も注入せずに `unknown` を返す。
 * 置き換えると、テーマファイルの名前を打ち間違えたのか、そもそも適用されていないのかをユーザーが区別できない。
 */
export function applyTheme(surface: Surface, id: string): ApplyResult {
  if (id === DEFAULT_ID) {
    clearTheme(surface);
    return 'default';
  }

  const body = bodyOf(id);
  if (body === null) {
    clearTheme(surface);
    return 'unknown';
  }

  return injectTheme(surface, id, body);
}

/**
 * `themes/` の外部変更に追従する。購読は 1 つだけ登録する。
 *
 * 面ごとに呼ばれるが、読み直しはカタログに 1 つしかない。
 * 面ごとに購読すると、1 回の保存で `list_user_themes` が面の数だけ往復する。
 *
 * どの 1 枚が変わったかは届かない。
 * 選択中の配色が変わったかどうかは読み直した結果と突き合わせないと判断できず、突き合わせるより再適用するほうが単純である。
 */
const reappliers = new Set<() => void>();
let watching = false;

export function installThemesWatch(reapply: () => void): void {
  reappliers.add(reapply);
  if (watching) return;

  watching = true;
  getPlatform().onUserThemesChanged(() => {
    void refreshUserThemes().then(() => {
      for (const fn of reappliers) fn();
      return null;
    });
  });
}

/** 宣言の並び。ユーザーのファイルを組み込みより先に見る。 */
function bodyOf(id: string): string | null {
  const user = userThemes.get(id);
  if (user) return user.declarations;

  const preset = (PRESETS as Record<string, Preset>)[id];
  return preset ? declarations(preset) : null;
}

/**
 * 明暗の別。一覧の並べ替えにだけ使う。
 *
 * 実際の挙動を決めるのは注入された CSS そのものであり、この判定ではない。
 * そのため、宣言の文字列を見るだけの簡易な判定で足りる。
 */
function schemeOf(text: string): 'light' | 'dark' | undefined {
  const found = /color-scheme\s*:\s*(light|dark)\b/iu.exec(text);
  return found ? (found[1]?.toLowerCase() as 'light' | 'dark') : undefined;
}
