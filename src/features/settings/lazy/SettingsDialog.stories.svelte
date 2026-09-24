<!--
  設定 UI（F-CONF-05 / ADR-0011）。

  実アプリでは `Ctrl+,` を押さないと表示されない（遅延チャンク）ため、状態を並べて確認するにはここが必要である。
  壊れた `settings.json` の読み取り専用状態は、実アプリでは実際にファイルを壊さないと再現できない。

  ライト / ダークはツールバーのテーマ切り替えで両方確認できる（`.storybook/preview.ts` が `data-theme` を設定する）。
  周りの色を決めるのは常にツールバー側で、story が設定した `theme` の値はラジオの選択状態にしか反映されない。
  実アプリでは `applyAppearance` が両方を同時に動かすが、ここでは「どちらのテーマでもダイアログが読めるか」を確認したいため、あえて分けてある。

  値の出どころは `settingsStore`、壊れているかどうかは `readSettings`（Platform 層）。
  どちらも loader で差し替えている。コンポーネントに props で渡す形にしないのは、実アプリと同じ経路を通すためである。

  開いているカテゴリは props に無い（モジュールスコープの `lastCategory` が持つ）。
  story を切り替えたときに前のカテゴリが残るのはそのためで、実アプリと同じ挙動である。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { DEFAULT_SETTINGS, getPlatform, setPlatform, type Platform, type Settings } from '@/platform';

  import { settingsStore } from '../store.svelte';
  import SettingsDialog from './SettingsDialog.svelte';

  const { Story } = defineMeta({
    title: 'シェル/設定',
    component: SettingsDialog,
    parameters: { layout: 'fullscreen' },
    args: { onclose: () => {} },
  });

  const BROKEN = {
    path: 'C:\\Users\\me\\AppData\\Roaming\\Marxdown\\settings.json',
    message: 'expected `,` or `}` at line 3 column 1',
  };

  function seed(values: Partial<Settings>, broken: typeof BROKEN | null = null) {
    return () => {
      settingsStore.values = { ...DEFAULT_SETTINGS, ...values };
      setPlatform({
        ...getPlatform(),
        readSettings: () => Promise.resolve({ values: settingsStore.values, broken }),
        // Storybook からファイルを書き込ませない。押せることだけ確認できればよい。
        // `null`（既定に戻す）を既定値へ直すのは Rust 側と挙動を揃えるためである。
        // そのまま設定すると、並びの項目（`editor.rulers` / `explorer.exclude`）が `null` になって描画時に例外になる。
        writeSettings: (patch) => {
          const merged = { ...settingsStore.values };
          for (const [key, value] of Object.entries(patch)) {
            Object.assign(merged, { [key]: value ?? DEFAULT_SETTINGS[key as keyof Settings] });
          }
          settingsStore.values = merged;
          return Promise.resolve(settingsStore.values);
        },
        openSettingsFile: () => Promise.resolve(),
        openThemesDir: () => Promise.resolve(),
        // 組み込みの 50 枚だけを見せる。Storybook にアプリデータ領域は無い。
        listUserThemes: () => Promise.resolve([]),
      } as Platform);
    };
  }
</script>

<!--
  初期状態。ここで「既定に戻す」が 1 つも出ていないことが要点。
  押しても何も起きないボタンを並べない（`items.ts` と同じ判断）。
-->
<Story name="既定値" loaders={[seed({})]} />

<!-- 変更した後。変更した項目にだけ「既定に戻す」が表示される。 -->
<Story
  name="調整済み"
  loaders={[
    seed({
      theme: 'dark',
      'preview.fontFamily': 'Noto Sans JP',
      'preview.fontSize': 18,
      'preview.lineHeight': 1.9,
      'preview.maxWidth': 80,
      'editor.fontFamily': 'Cascadia Code',
      'editor.fontSize': 15,
      'editor.rulers': [80, 100],
      'editor.wordWrap': 'bounded',
      'editor.minimap.enabled': true,
    }),
  ]}
/>

<!--
  配色（ADR-0013 / ADR-0014）。見本がその場で選んだ配色になることが要点で、モーダルにしたことで背後の本文が見えない分を見本で補っている（ADR-0011）。
  周りのダイアログはクロームの配色のままである（配色は面にしか適用されない）。
-->
<Story name="配色を選んでいる" loaders={[seed({ 'preview.theme': 'solarized', 'editor.theme': 'dracula' })]} />

<!--
  設定ファイルに書かれているが、組み込みにも themes/ にも無い綴り（ADR-0014）。
  既定に置き換えず、見つからないことを選択肢自身が示す。
  置き換えると、打ち間違いと未適用をユーザーが区別できない。
-->
<Story name="配色が見つからない" loaders={[seed({ 'editor.theme': 'no-such-theme' })]} />

<!--
  折り返しが `off` のとき、「折り返す桁」が出ないこと。
  使わない値を編集させても意味が無い（`items.ts` と同じ判断）。
-->
<Story name="折り返しを切っている" loaders={[seed({ 'editor.wordWrap': 'off', 'editor.lineNumbers': 'off' })]} />

<!--
  壊れた `settings.json`（02.architecture/04-rust-responsibilities.md §5）。
  入力欄がまとめて止まり、フッタのファイル導線だけが押せる。
  ここで保存できてしまうと、ユーザーが修正している最中のファイルを上書きしてしまう。
-->
<Story name="settings.json が壊れている" loaders={[seed({ theme: 'dark' }, BROKEN)]} />
