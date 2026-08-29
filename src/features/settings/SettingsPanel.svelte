<!--
  設定 UI（F-CONF-05 / 03.ux-spec/README.md §1「Defaults Matter」）。

  ```text
  ┌──────────────────────────────┐
  │ 設定                       ✕ │
  ├──────────────────────────────┤
  │ テーマ                        │
  │  ( ) OS に合わせる            │
  │  (•) ライト   ( ) ダーク       │
  │                              │
  │ 本文のフォント     既定に戻す  │
  │  [ Noto Sans JP           ]  │
  │                              │
  │ 文字サイズ                    │
  │  [ 16 ] px                   │
  │ 行間                          │
  │  [ 1.75 ]                    │
  │ 本文幅            既定に戻す   │
  │  [ 90 ] ch                   │
  ├──────────────────────────────┤
  │ settings.json を開く          │
  │ custom.css を開く             │
  └──────────────────────────────┘
  ```

  **このコンポーネントは遅延チャンクにある**（06.roadmap/m1.5-shell-and-settings.md §3 の完了条件）。
  `Ctrl+,` かハンバーガーメニューの「設定」が押されるまでロードされない。

  # 本文に重ねる。押しのけない

  右端に浮かせて、本文はそのまま後ろに残す。`grid` の `rightpane` を使わないのは、
  そこがアウトラインの場所だからでもあるが、主な理由は
  **調整の結果が見えていないと調整にならない**こと。本文を横に詰めてしまうと、
  本文幅を変えたときに何が起きたのかが分からなくなる。

  # 「既定に戻す」は、既定でないときだけ出す

  押しても何も起きないボタンを並べない（`items.ts` と同じ判断）。
  出ていること自体が「ここは触ってある」という印になる。

  # 壊れた settings.json では保存を試みない

  Rust 側は拒否するのでファイルは無事だが（02.architecture/04-rust-responsibilities.md §5）、
  **UI が「保存できたように見せる」のが最悪**である。理由を上に出し、
  入力欄ごと止めて、直す場所（ファイル）への導線だけを残す。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { ja } from '@/i18n/ja';
  import { DEFAULT_SETTINGS, getPlatform, type Settings, type SettingsProblem, type Theme } from '@/platform';

  import { LIMITS, type NumericKey } from './appearance';
  import { changeSetting } from './change';
  import { settingsStore } from './store.svelte';

  const { onclose }: { onclose: () => void } = $props();

  const uid = $props.id();

  const values = $derived(settingsStore.values);

  /**
   * `settings.json` を読めていない事実。**ストアには置かない。**
   *
   * 「壊れている」を状態として 2 か所に持つと、直したあとに片方だけ残る
   * （`store.svelte.ts` の冒頭）。ここでは開いている間だけ、
   * 開いた時点と変更の通知が来た時点に読み直して持つ。
   */
  let broken = $state<SettingsProblem | null>(null);

  let panel: HTMLElement;

  const THEMES: { value: Theme; label: string }[] = [
    { value: 'system', label: ja.settings.themeSystem },
    { value: 'light', label: ja.settings.themeLight },
    { value: 'dark', label: ja.settings.themeDark },
  ];

  async function reload(): Promise<void> {
    try {
      const loaded = await getPlatform().readSettings();
      broken = loaded.broken;
    } catch {
      // 読めなかったこと自体は伝えない（`refreshSettings` と同じ判断）。
      // 直前の状態のまま開いておくほうが、開いた瞬間に閉じるより良い。
    }
  }

  onMount(() => {
    void reload();
    // 先頭の操作子（テーマの選択中のラジオ）へ着地する。マウスを持たない人が
    // 開いた直後に `Tab` を何度も押さずに済むように（`AppMenu` と同じ扱い）。
    (panel.querySelector<HTMLElement>('input:checked') ?? panel.querySelector<HTMLElement>('input'))?.focus();
    // 外部エディタで直された / 壊された瞬間に、この画面の見え方も変わる。
    // 値のほうは `installSettingsWatch` が当て直しているので、ここで見るのは
    // 「保存できる状態か」だけ。
    return getPlatform().onSettingsChanged(() => void reload());
  });

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // プレビュー内検索など、Escape をグローバルに握っている機能へ渡さない。
    event.stopPropagation();
    event.preventDefault();
    onclose();
  }

  /** 数値の入力。**空欄や範囲外では当てない**（打っている途中の状態を潰さない）。 */
  function onNumberInput(key: NumericKey, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const value = input.valueAsNumber;
    if (Number.isNaN(value)) return;
    const { min, max } = LIMITS[key];
    if (value < min || value > max) return;
    changeSetting(key, value);
  }

  /** 既定と違うか。「既定に戻す」を出すかどうかの判断がこれ 1 つで済む。 */
  function customized(key: keyof Settings): boolean {
    return values[key] !== DEFAULT_SETTINGS[key];
  }
</script>

<!--
  `Escape` はパネル全体で受ける。個々の入力欄に付けて回ると、
  ラベルやスクロール領域を押した後に効かなくなる（`AppMenu` と同じ形）。
-->
<div
  class="mx-settings"
  role="dialog"
  aria-label={ja.settings.title}
  tabindex="-1"
  bind:this={panel}
  onkeydown={onKeydown}
>
  <header class="mx-settings__header">
    <h2 class="mx-settings__title">{ja.settings.title}</h2>
    <button type="button" class="mx-settings__close" aria-label={ja.settings.close} onclick={onclose}>✕</button>
  </header>

  {#if broken}
    <p class="mx-settings__broken" role="alert">{ja.settings.readOnly}</p>
  {/if}

  <!--
    壊れているときは `fieldset` 1 枚でまとめて止める。個々の `disabled` を
    書いて回ると、項目を足したときに 1 つ書き忘れる。
  -->
  <fieldset class="mx-settings__body" disabled={broken !== null}>
    <fieldset class="mx-settings__field">
      <legend class="mx-settings__label">{ja.settings.theme}</legend>
      <!--
        素のラジオボタンにしてある。同じ `name` を持つラジオは、矢印キーでの移動も
        Tab の扱い（グループ全体で 1 つ）も**ブラウザ側が実装している**。
        見た目のためにボタンで組み直すと、それを自分で書き直すことになる。
      -->
      <div class="mx-settings__choices">
        {#each THEMES as option (option.value)}
          <label class="mx-settings__choice">
            <input
              type="radio"
              name="{uid}-theme"
              value={option.value}
              checked={values.theme === option.value}
              onchange={() => changeSetting('theme', option.value)}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="mx-settings__field">
      <div class="mx-settings__row">
        <label class="mx-settings__label" for="{uid}-font">{ja.settings.fontFamily}</label>
        {#if customized('preview.fontFamily')}
          <button
            type="button"
            class="mx-settings__reset"
            title={ja.settings.resetOf(ja.settings.fontFamily)}
            onclick={() => changeSetting('preview.fontFamily', null)}
          >
            {ja.settings.reset}
          </button>
        {/if}
      </div>
      <input
        id="{uid}-font"
        type="text"
        class="mx-settings__text"
        spellcheck="false"
        autocomplete="off"
        placeholder={ja.settings.fontFamilyPlaceholder}
        value={values['preview.fontFamily']}
        oninput={(e) => changeSetting('preview.fontFamily', e.currentTarget.value)}
      />
      <p class="mx-settings__hint">{ja.settings.fontFamilyHint}</p>
    </div>

    <div class="mx-settings__field">
      <div class="mx-settings__row">
        <label class="mx-settings__label" for="{uid}-font">{ja.settings.codeFontFamily}</label>
        {#if customized('preview.codeFontFamily')}
          <button
            type="button"
            class="mx-settings__reset"
            title={ja.settings.resetOf(ja.settings.codeFontFamily)}
            onclick={() => changeSetting('preview.codeFontFamily', null)}
          >
            {ja.settings.reset}
          </button>
        {/if}
      </div>
      <input
        id="{uid}-font"
        type="text"
        class="mx-settings__text"
        spellcheck="false"
        autocomplete="off"
        placeholder={ja.settings.fontFamilyPlaceholder}
        value={values['preview.codeFontFamily']}
        oninput={(e) => changeSetting('preview.codeFontFamily', e.currentTarget.value)}
      />
      <p class="mx-settings__hint">{ja.settings.fontFamilyHint}</p>
    </div>

    <!--
      数値の 3 項目は形が同じ。単位と補足だけが違うので snippet で 1 つにまとめる。
      **`preview.fontSize` だけ単位を書き、`preview.lineHeight` には書かない**のは、
      行間が倍率（無次元）だからで、`px` と並べると誤解を招く。
    -->
    {#snippet numberField(key: NumericKey, label: string, unit: string, hint: string)}
      <div class="mx-settings__field">
        <div class="mx-settings__row">
          <label class="mx-settings__label" for="{uid}-{key}">{label}</label>
          {#if customized(key)}
            <button
              type="button"
              class="mx-settings__reset"
              title={ja.settings.resetOf(label)}
              onclick={() => changeSetting(key, null)}
            >
              {ja.settings.reset}
            </button>
          {/if}
        </div>
        <div class="mx-settings__row">
          <input
            id="{uid}-{key}"
            type="number"
            class="mx-settings__number"
            min={LIMITS[key].min}
            max={LIMITS[key].max}
            step={LIMITS[key].step}
            value={values[key]}
            oninput={(e) => onNumberInput(key, e)}
          />
          <span class="mx-settings__unit">{unit}</span>
        </div>
        {#if hint}<p class="mx-settings__hint">{hint}</p>{/if}
      </div>
    {/snippet}

    {@render numberField('preview.fontSize', ja.settings.fontSize, ja.settings.unitPx, '')}
    {@render numberField('preview.lineHeight', ja.settings.lineHeight, '', '')}
    {@render numberField('preview.maxWidth', ja.settings.maxWidth, ja.settings.unitCh, ja.settings.maxWidthHint)}
  </fieldset>

  <!--
    ファイルへの導線。**壊れていても押せる**（直す場所はファイルにしかない）。

    カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）に置くのも
    **このボタン 1 つだけ**。有効化のスイッチもパスの設定も無く、
    `custom.css` が存在すれば効く。設定項目を増やさないことがそのまま仕様なので、
    ここに ON/OFF を足さないこと。
  -->
  <footer class="mx-settings__footer">
    <div class="mx-settings__files">
      <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openSettingsFile()}>
        {ja.settings.edit}
      </button>
      <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openCustomCssFile()}>
        {ja.customCss.open}
      </button>
    </div>
    <p class="mx-settings__hint">{ja.settings.editHint}</p>
    <p class="mx-settings__hint">{ja.customCss.hint}</p>
  </footer>
</div>

<style>
  /*
   * 本文の右端に浮かせる。タイトルバーとステータスバーの間に収める。
   *
   * `position: fixed` なので body の grid には乗らない。ペインの列
   * （`shell.css` の `rightpane`）を使わないのは、本文を押しのけないため。
   */
  .mx-settings {
    position: fixed;
    top: var(--mx-titlebar-height);
    bottom: var(--mx-statusbar-height);
    inset-inline-end: 0;
    z-index: 35;

    display: flex;
    flex-direction: column;
    width: min(22rem, 100vw);

    border-inline-start: 1px solid var(--mx-color-border);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-size: var(--mx-font-size-ui);
    color: var(--mx-color-fg);
  }

  .mx-settings:focus {
    outline: none;
  }

  .mx-settings__header {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
    padding: var(--mx-space-2) var(--mx-space-2) var(--mx-space-2) var(--mx-space-4);
    border-bottom: 1px solid var(--mx-color-border-subtle);
  }

  .mx-settings__title {
    flex: 1;
    margin: 0;
    font-size: var(--mx-font-size-ui);
    font-weight: 600;
  }

  .mx-settings__close {
    flex: none;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    cursor: default;
  }

  .mx-settings__close:hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  /* 保存できない理由。**入力欄より上に出す**（触る前に読ませる）。 */
  .mx-settings__broken {
    flex: none;
    margin: 0;
    padding: var(--mx-space-2) var(--mx-space-4);
    border-bottom: 1px solid var(--mx-color-border-subtle);
    background: var(--mx-color-bg-inset);
    color: var(--mx-color-danger);
  }

  /* `fieldset` の既定（枠・余白・`min-inline-size: min-content`）を落とす。
     最後のものを消し忘れると、幅が中身に押し広げられてパネルからはみ出す。 */
  .mx-settings__body {
    flex: 1;
    min-height: 0;
    min-inline-size: 0;
    overflow-y: auto;
    margin: 0;
    padding: var(--mx-space-4);
    border: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-6);
  }

  /* テーマの 3 択だけが `fieldset`（ラジオのグループ）。
     他の項目（`div`）と同じ見た目に揃えるため、既定を落とす。 */
  .mx-settings__field {
    margin: 0;
    padding: 0;
    border: none;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-2);
  }

  .mx-settings__row {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__label {
    flex: 1;
    padding: 0;
    font-weight: 600;
  }

  .mx-settings__reset {
    flex: none;
    padding: 0 var(--mx-space-1);
    border: none;
    background: none;
    color: var(--mx-color-accent);
    font: inherit;
    font-size: 11px;
    cursor: default;
  }

  .mx-settings__reset:hover:not(:disabled) {
    text-decoration: underline;
  }

  .mx-settings__choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-1) var(--mx-space-4);
  }

  .mx-settings__choice {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__text,
  .mx-settings__number {
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
  }

  .mx-settings__number {
    width: 7ch;
    font-variant-numeric: tabular-nums;
  }

  .mx-settings__unit {
    color: var(--mx-color-fg-subtle);
  }

  .mx-settings__hint {
    margin: 0;
    color: var(--mx-color-fg-subtle);
    font-size: 11px;
  }

  .mx-settings__footer {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
    padding: var(--mx-space-3) var(--mx-space-4);
    border-top: 1px solid var(--mx-color-border-subtle);
  }

  /* 2 つ並ぶ（`settings.json` と `custom.css`）。狭い幅では折り返す。 */
  .mx-settings__files {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-2);
    margin-bottom: var(--mx-space-1);
  }

  /* 壊れているときも押せる。**直す場所はファイルにしかない**（F-CONF-06）。 */
  .mx-settings__file {
    padding: var(--mx-space-1) var(--mx-space-3);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
    cursor: default;
  }

  .mx-settings__file:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-settings :is(input, button):focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings :disabled {
    opacity: 0.5;
  }
</style>
