<!--
  設定 UI（F-CONF-05 / ADR-0011）。

  実アプリでは `Ctrl+,` を押さないと出てこない（遅延チャンク）ので、状態を並べて
  見るにはここが要る。**壊れた `settings.json` の読み取り専用状態**は、
  実アプリだと本当にファイルを壊さないと再現できない。

  ライト / ダークはツールバーのテーマ切り替えで両方見られる
  （`.storybook/preview.ts` が `data-theme` を打つ）。**周りの色を決めるのは
  常にツールバー側**で、story が積んだ `theme` の値はラジオの選択状態にしか出ない。
  実アプリでは `applyAppearance` が両方を同時に動かすが、ここでは
  「どちらのテーマでもダイアログが読めるか」を見たいので、あえて分けてある。

  値の出どころは `settingsStore`、壊れているかどうかは `readSettings`（Platform 層）。
  どちらも loader で差し替えている。**コンポーネントに props で流し込む形にしない**のは、
  実アプリと同じ経路を通したいため。

  **開いているカテゴリは props に無い**（モジュールスコープの `lastCategory` が持つ）。
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
    path: 'C:\\Users\\me\\AppData\\Roaming\\com.antimacho612.marxdown\\settings.json',
    message: 'expected `,` or `}` at line 3 column 1',
  };

  function seed(values: Partial<Settings>, broken: typeof BROKEN | null = null) {
    return () => {
      settingsStore.values = { ...DEFAULT_SETTINGS, ...values };
      setPlatform({
        ...getPlatform(),
        readSettings: () => Promise.resolve({ values: settingsStore.values, broken }),
        // Storybook からファイルを書きに行かせない。押せることだけ確認できればよい。
        writeSettings: (patch) => {
          settingsStore.values = { ...settingsStore.values, ...patch } as Settings;
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
  **初期状態。ここで「既定に戻す」が 1 つも出ていないことが要点。**
  押しても何も起きないボタンを並べない（`items.ts` と同じ判断）。
-->
<Story name="既定値" loaders={[seed({})]} />

<!-- 触った後。触った項目にだけ「既定に戻す」が生える。 -->
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
  配色（ADR-0013 / ADR-0014）。**見本がその場でそのパレットになる**ことが要点で、
  モーダルにしたぶん（ADR-0011）の埋め合わせがここに出ている。
  周りのダイアログはクロームの配色のままである（テーマは面にしか効かない）。
-->
<Story name="配色を選んでいる" loaders={[seed({ 'preview.theme': 'solarized', 'editor.theme': 'dracula' })]} />

<!--
  設定ファイルに書かれているが、組み込みにも themes/ にも無い綴り（ADR-0014）。
  **既定へ落とさず、見つからないことを選択肢自身が言う。**
  落とすと、打ち間違いと未適用をユーザーが区別できない。
-->
<Story name="配色が見つからない" loaders={[seed({ 'editor.theme': 'no-such-theme' })]} />

<!--
  折り返しが `off` のとき、**「折り返す桁」が出ない**こと。
  使わない値を編集させても意味が無い（`items.ts` と同じ判断）。
-->
<Story name="折り返しを切っている" loaders={[seed({ 'editor.wordWrap': 'off', 'editor.lineNumbers': 'off' })]} />

<!--
  壊れた `settings.json`（02.architecture/04-rust-responsibilities.md §5）。
  **入力欄がまとめて止まり、フッタのファイル導線だけが押せる。**
  ここで保存できてしまうと、ユーザーが直している最中のファイルを吹き飛ばす。
-->
<Story name="settings.json が壊れている" loaders={[seed({ theme: 'dark' }, BROKEN)]} />
