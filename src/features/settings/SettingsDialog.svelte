<!--
@component
設定 UI（F-CONF-05 / ADR-0011）。

遅延チャンクにあり、`Ctrl+,` かメニューの「設定」が押されるまでロードされない。

項目が 6 個から 28 個に増え 1 列に収まらなくなったため、モーダルダイアログ（カテゴリを持てる形）へ移した。
背後が見えなくなる代わりに、フォントまわりだけ見本を内蔵する（本文幅・折り返し・タブ幅は見本に出せないため出していない）。
フォーカストラップ・inert 化・`::backdrop` はブラウザの `<dialog>` に任せる。

「既定に戻す」ボタンは既定でないときだけ出す（押しても無意味なボタンを並べない）。
settings.json が壊れている間は保存を試みない。
Rust 側も拒否するが、UI が「保存できたように見せる」のを避けるため入力欄ごと止め、ファイルへの導線だけ残す。
-->

<script module lang="ts">
  /**
   * 最後に開いていたカテゴリ。**永続化しない。**
   *
   * 「さっき見ていた場所」は、設定ファイルに残すほどの寿命を持たない。
   * 同じセッションで開き直したときに戻れば足りる。
   */
  let lastCategory: CategoryId = 'appearance';
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  import { ja } from '@/i18n/ja';
  import { DEFAULT_SETTINGS, getPlatform, type Settings, type SettingsProblem } from '@/platform';

  import { LIMITS, type NumericKey } from './appearance';
  import { changeSetting } from './change';
  import {
    ContentSample,
    EditorSample,
    Navigation,
    NumberField,
    RadioGroup,
    Section,
    SelectField,
    TextField,
    ToggleField,
    type Choice,
  } from './components';
  import { settingsStore } from './store.svelte';

  const { onclose }: { onclose: () => void } = $props();

  const values = $derived(settingsStore.values);

  type CategoryId = 'appearance' | 'preview' | 'editor' | 'window';

  /** 値が文字列のキー。選択肢（`<select>` / ラジオ）とテキスト欄が該当する。 */
  type ChoiceKey = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings];
  /** 値が真偽のキー。チェックボックスが該当する。 */
  type ToggleKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

  /**
   * `settings.json` を読めていない事実。**ストアには置かない。**
   *
   * 「壊れている」を状態として 2 か所に持つと、直したあとに片方だけ残る
   * （`store.svelte.ts` の冒頭）。ここでは開いている間だけ、
   * 開いた時点と変更の通知が来た時点に読み直して持つ。
   */
  let broken = $state<SettingsProblem | null>(null);

  let dialog: HTMLDialogElement;

  let category = $state<CategoryId>(lastCategory);

  $effect(() => {
    lastCategory = category;
  });

  const CATEGORIES: { id: CategoryId; label: string }[] = [
    { id: 'appearance', label: ja.settings.categories.appearance },
    { id: 'preview', label: ja.settings.categories.preview },
    { id: 'editor', label: ja.settings.categories.editor },
    { id: 'window', label: ja.settings.categories.window },
  ];

  const THEMES: Choice[] = [
    { value: 'system', label: ja.settings.themeSystem },
    { value: 'light', label: ja.settings.themeLight },
    { value: 'dark', label: ja.settings.themeDark },
  ];

  const CLOSE_BEHAVIORS: Choice[] = [
    { value: 'tray', label: ja.settings.window.closeBehaviorTray },
    { value: 'exit', label: ja.settings.window.closeBehaviorExit },
  ];

  /** 選択肢は i18n のオブジェクトをそのまま並べる。**綴りは VS Code の値と 1:1**。 */
  function choices(labels: Record<string, string>): Choice[] {
    return Object.entries(labels).map(([value, label]) => ({ value, label }));
  }

  const WORD_WRAP = choices(ja.settings.editor.wordWrapOptions);
  const LINE_NUMBERS = choices(ja.settings.editor.lineNumbersOptions);
  const RENDER_WHITESPACE = choices(ja.settings.editor.renderWhitespaceOptions);
  const RENDER_LINE_HIGHLIGHT = choices(ja.settings.editor.renderLineHighlightOptions);
  const CURSOR_STYLE = choices(ja.settings.editor.cursorStyleOptions);
  const CURSOR_BLINKING = choices(ja.settings.editor.cursorBlinkingOptions);
  const PALETTES = choices(ja.settings.paletteOptions);

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
    // **`showModal()` で開く。** `open` 属性を書くと非モーダルになり、
    // フォーカストラップも `::backdrop` も付かない。
    dialog.showModal();
    void reload();
    focusFirstControl();
    // 外部エディターで直された / 壊された瞬間に、この画面の見え方も変わる。
    // 値のほうは `installSettingsWatch` が当て直しているので、ここで見るのは
    // 「保存できる状態か」だけ。
    const unwatch = getPlatform().onSettingsChanged(() => void reload());

    return () => {
      unwatch();
      // **明示的に閉じる。** 要素を外すだけでもトップレイヤからは降りるが、
      // 開いたまま外す形にすると `open` の状態と DOM の有無が食い違う。
      if (dialog.open) dialog.close();
    };
  });

  /**
   * 先頭の操作子へ着地する。マウスを持たない人が開いた直後に `Tab` を
   * 何度も押さずに済むように（`AppMenu` と同じ扱い）。
   *
   * **カテゴリの見出しではなく、いま見えている中身の先頭**へ入れる。
   * カテゴリは既に選ばれていて、押しに来たのはその中身だから。
   */
  function focusFirstControl(): void {
    const pane = dialog.querySelector<HTMLElement>('.mx-settings__pane');
    (pane?.querySelector<HTMLElement>('input:checked') ?? pane?.querySelector<HTMLElement>('input, select'))?.focus();
  }

  function close(): void {
    onclose();
  }

  /**
   * `Escape`。**プレビュー内検索など、グローバルに握っている機能へ渡さない。**
   *
   * `<dialog>` は `Escape` で自分から閉じるが、そのときのキーイベントは
   * ダイアログの外まで昇っていく。ここで止めておかないと、
   * 閉じると同時に背後の検索まで閉じる。
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    close();
  }

  /** 背景（`::backdrop`）を押したら閉じる。**中身を押したときは閉じない。** */
  function onBackdropClick(event: MouseEvent): void {
    if (event.target === dialog) close();
  }

  /**
   * 選択肢の変更。
   *
   * `<select>` から返るのは素の `string` なので、ここで 1 回だけ狭める。
   * **値の妥当性は Rust 側が持っている**（知らない綴りは既定値に落ちる）ので、
   * ここで一覧と突き合わせ直さない。
   */
  function changeChoice(key: ChoiceKey, value: string): void {
    changeSetting(key, value as Settings[ChoiceKey]);
  }

  /**
   * 既定と違うか。「既定に戻す」を出すかどうかの判断がこれ 1 つで済む。
   *
   * **配列は中身で比べる。** `editor.rulers` は毎回別のオブジェクトになるので、
   * 参照で比べると触っていなくても「戻す」が出続ける。
   */
  function customized(key: keyof Settings): boolean {
    const current = values[key];
    const initial = DEFAULT_SETTINGS[key];
    if (Array.isArray(current) && Array.isArray(initial)) {
      return current.length !== initial.length || current.some((value, index) => value !== initial[index]);
    }
    return current !== initial;
  }

  /**
   * 「既定に戻す」の押し先。**既定のままなら `undefined`** を返す。
   *
   * 出すか出さないかの判断はここ 1 か所にしかない。部品の側は
   * 「渡されたら出す」だけを知っていればよく、設定の既定値を知らずに済む。
   */
  function resetOf(key: keyof Settings): (() => void) | undefined {
    if (!customized(key)) return undefined;
    return () => changeSetting(key, null);
  }

  /* ---------------------------------------------------------------- */
  /* 縦罫線                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * 縦罫線だけは**入力欄の文字列とストアの値が 1:1 でない**（`80, 100` ⇄ `[80, 100]`）。
   *
   * 値をそのまま `value` に流し込むと、`80,` まで打った時点で `80` に書き戻されて
   * カンマが消える。打っている途中の文字列は手元に持ち、**読めた時だけ**押し込む。
   */
  // 初期値だけが要る。追従は下の `$effect` が担当する。
  // svelte-ignore state_referenced_locally
  let rulersText = $state(values['editor.rulers'].join(', '));
  /** 自分が押し込んだ結果。これと違う値が来たら、外から変わったということ。 */
  // 同上。
  // svelte-ignore state_referenced_locally
  let pushedRulers = $state(values['editor.rulers'].join(', '));

  $effect(() => {
    const next = values['editor.rulers'].join(', ');
    if (next === pushedRulers) return;
    // 外部エディターでの編集か「既定に戻す」。入力欄を追いつかせる。
    rulersText = next;
    pushedRulers = next;
  });

  function onRulersInput(raw: string): void {
    rulersText = raw;

    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    // 打っている途中（`80, ` の空欄や `8o` の打ち間違い）では当てない。
    if (parts.some((part) => !/^\d+$/u.test(part))) return;

    const next = parts.map(Number);
    pushedRulers = next.join(', ');
    changeSetting('editor.rulers', next);
  }
</script>

<dialog
  class="mx-settings"
  aria-label={ja.settings.title}
  bind:this={dialog}
  onkeydown={onKeydown}
  onclick={onBackdropClick}
  oncancel={(e) => {
    // `Escape` は `onKeydown` で処理済み。ここへ来るのは他の閉じ要求
    // （OS 側のジェスチャなど）なので、同じ出口へ寄せる。
    e.preventDefault();
    close();
  }}
>
  <header class="mx-settings__header">
    <h2 class="mx-settings__title">{ja.settings.title}</h2>
    <button type="button" class="mx-settings__close" aria-label={ja.settings.close} onclick={close}>✕</button>
  </header>

  {#if broken}
    <p class="mx-settings__broken" role="alert">{ja.settings.readOnly}</p>
  {/if}

  <div class="mx-settings__body">
    <Navigation items={CATEGORIES} selected={category} onSelectionChange={(id) => (category = id)} />

    <!--
      壊れているときは `fieldset` 1 枚でまとめて止める。個々の `disabled` を
      書いて回ると、項目を足したときに 1 つ書き忘れる。
    -->
    <fieldset class="mx-settings__pane" disabled={broken !== null}>
      {#if category === 'appearance'}
        {@render radioGroup('theme', ja.settings.theme, THEMES)}
        <p class="mx-settings__hint">{ja.settings.themeHint}</p>
      {:else if category === 'preview'}
        <!--
          配色を先頭に置く（ADR-0013）。**面の印象を決めるのはここ**で、
          フォントや幅はその上での微調整にあたる。
        -->
        {@render selectField('preview.theme', ja.settings.palette, PALETTES, ja.settings.paletteHint)}
        {@render textField('preview.fontFamily', ja.settings.fontFamily, ja.settings.fontFamilyHint)}
        {@render textField('preview.codeFontFamily', ja.settings.codeFontFamily, ja.settings.fontFamilyHint)}
        {@render numberField('preview.fontSize', ja.settings.fontSize, ja.settings.unitPx, '')}
        {@render numberField('preview.lineHeight', ja.settings.lineHeight, '', '')}
        {@render numberField('preview.maxWidth', ja.settings.maxWidth, ja.settings.unitCh, ja.settings.maxWidthHint)}
        <ContentSample palette={values['preview.theme']} />
      {:else if category === 'editor'}
        {@render selectField('editor.theme', ja.settings.palette, PALETTES, ja.settings.paletteHint)}
        <EditorSample
          palette={values['editor.theme']}
          fontFamily={values['editor.fontFamily']}
          fontSize={values['editor.fontSize']}
          lineHeight={values['editor.lineHeight']}
          letterSpacing={values['editor.letterSpacing']}
          ligatures={values['editor.fontLigatures']}
          showLineNumbers={values['editor.lineNumbers'] !== 'off'}
        />

        <Section label={ja.settings.sections.font} />
        {@render textField('editor.fontFamily', ja.settings.editor.fontFamily, ja.settings.fontFamilyHint)}
        {@render numberField('editor.fontSize', ja.settings.editor.fontSize, ja.settings.unitPx, '')}
        {@render numberField('editor.lineHeight', ja.settings.editor.lineHeight, '', '')}
        {@render numberField('editor.letterSpacing', ja.settings.editor.letterSpacing, ja.settings.unitPx, '')}
        {@render toggleField('editor.fontLigatures', ja.settings.editor.fontLigatures)}

        <Section label={ja.settings.sections.display} />
        {@render selectField('editor.lineNumbers', ja.settings.editor.lineNumbers, LINE_NUMBERS, '')}
        {@render selectField('editor.renderWhitespace', ja.settings.editor.renderWhitespace, RENDER_WHITESPACE, '')}
        {@render selectField(
          'editor.renderLineHighlight',
          ja.settings.editor.renderLineHighlight,
          RENDER_LINE_HIGHLIGHT,
          '',
        )}
        {@render toggleField('editor.renderControlCharacters', ja.settings.editor.renderControlCharacters)}
        {@render toggleField('editor.guides.indentation', ja.settings.editor.guidesIndentation)}
        {@render toggleField('editor.bracketPairColorization.enabled', ja.settings.editor.bracketPairColorization)}
        {@render toggleField('editor.minimap.enabled', ja.settings.editor.minimap)}
        {@render rulersField()}
        {@render numberField('editor.padding.top', ja.settings.editor.paddingTop, ja.settings.unitPx, '')}

        <Section label={ja.settings.sections.input} />
        {@render selectField('editor.wordWrap', ja.settings.editor.wordWrap, WORD_WRAP, '')}
        {#if values['editor.wordWrap'] === 'wordWrapColumn' || values['editor.wordWrap'] === 'bounded'}
          <!-- 桁を使う設定のときだけ出す。使わない値を編集させても意味が無い。 -->
          {@render numberField('editor.wordWrapColumn', ja.settings.editor.wordWrapColumn, ja.settings.unitCh, '')}
        {/if}
        {@render numberField('editor.tabSize', ja.settings.editor.tabSize, '', '')}
        {@render toggleField('editor.insertSpaces', ja.settings.editor.insertSpaces)}
        {@render selectField('editor.cursorStyle', ja.settings.editor.cursorStyle, CURSOR_STYLE, '')}
        {@render selectField('editor.cursorBlinking', ja.settings.editor.cursorBlinking, CURSOR_BLINKING, '')}
        {@render numberField(
          'editor.cursorSurroundingLines',
          ja.settings.editor.cursorSurroundingLines,
          ja.settings.unitLines,
          '',
        )}
        {@render toggleField('editor.scrollBeyondLastLine', ja.settings.editor.scrollBeyondLastLine)}
      {:else}
        {@render radioGroup('window.closeBehavior', ja.settings.window.closeBehavior, CLOSE_BEHAVIORS)}
        <p class="mx-settings__hint">{ja.settings.window.closeBehaviorHint}</p>
      {/if}
    </fieldset>
  </div>

  <!-- TODO: 削除。preview.css は「プレビュー」カテゴリの中、editor.css は「エディター」カテゴリの中に置く。 -->
  <footer class="mx-settings__footer">
    <div class="mx-settings__files">
      <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openCustomCssFile()}>
        {ja.customCss.open}
      </button>
      <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openEditorCssFile()}>
        {ja.customCss.openEditor}
      </button>
    </div>
  </footer>
</dialog>

<!-- MARK: Snippets -->
<!--
  設定のキーと部品（`components/`）をつなぐだけの層。**見た目はここに書かない。**

  1 項目を足すのに要るのが呼び出し側の 1 行だけ、という状態を保つためにある。
  ここを畳んで呼び出し側に部品を直接並べると、`values[...]` と `changeSetting(...)` の
  組が 22 回ぶん写経されることになる。
-->
{#snippet textField(key: ChoiceKey, label: string, hint: string)}
  <TextField
    {label}
    {hint}
    value={values[key]}
    placeholder={ja.settings.fontFamilyPlaceholder}
    onInput={(value) => changeChoice(key, value)}
    onReset={resetOf(key)}
  />
{/snippet}

{#snippet numberField(key: NumericKey, label: string, unit: string, hint: string)}
  <NumberField
    {label}
    {unit}
    {hint}
    value={values[key]}
    min={LIMITS[key].min}
    max={LIMITS[key].max}
    step={LIMITS[key].step}
    onInput={(value) => changeSetting(key, value)}
    onReset={resetOf(key)}
  />
{/snippet}

{#snippet selectField(key: ChoiceKey, label: string, options: Choice[], hint: string)}
  <SelectField
    {label}
    {options}
    {hint}
    value={values[key]}
    onChange={(value) => changeChoice(key, value)}
    onReset={resetOf(key)}
  />
{/snippet}

{#snippet toggleField(key: ToggleKey, label: string)}
  <ToggleField
    {label}
    checked={values[key]}
    onChange={(checked) => changeSetting(key, checked)}
    onReset={resetOf(key)}
  />
{/snippet}

{#snippet radioGroup(key: ChoiceKey, label: string, options: Choice[])}
  <RadioGroup
    {label}
    {options}
    value={values[key]}
    onChange={(value) => changeChoice(key, value)}
    onReset={resetOf(key)}
  />
{/snippet}

<!-- 縦罫線だけは**打っている途中の文字列**を渡す（上の `rulersText` を参照）。 -->
{#snippet rulersField()}
  <TextField
    label={ja.settings.editor.rulers}
    hint={ja.settings.editor.rulersHint}
    value={rulersText}
    placeholder={ja.settings.editor.rulersPlaceholder}
    inputmode="numeric"
    onInput={onRulersInput}
    onReset={resetOf('editor.rulers')}
  />
{/snippet}

<style>
  /*
   * トップレイヤに乗るので、シェルの grid にも `z-index` にも関わらない。
   * 位置決め（中央）も `::backdrop` もブラウザ側が持っている。
   */
  .mx-settings {
    width: min(880px, calc(100vw - 4rem));
    height: min(620px, calc(100vh - 6rem));
    padding: 0;
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-family: var(--mx-font-ui);
    font-size: var(--mx-font-size-ui);
    color: var(--mx-color-fg);

    flex-direction: column;
  }

  /* `display: flex` は開いているときだけ。閉じているあいだは `none` が勝つ必要がある。 */
  .mx-settings[open] {
    display: flex;
  }

  .mx-settings::backdrop {
    background: rgb(0 0 0 / 35%);
  }

  /*
   * 03.ux-spec/09-motion.md「パレットの出現 100ms ease-out」に揃える。
   * 本文の上に重なるものであり、本文のレイアウトには触らない（§1 の基準）。
   */
  .mx-settings[open],
  .mx-settings[open]::backdrop {
    animation: mx-settings-in 100ms ease-out;
  }

  @keyframes mx-settings-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mx-settings[open],
    .mx-settings[open]::backdrop {
      animation: none;
    }
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

  .mx-settings__body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 10rem 1fr;
  }

  /* `fieldset` の既定（枠・余白・`min-inline-size: min-content`）を落とす。
     最後のものを消し忘れると、幅が中身に押し広げられてダイアログからはみ出す。 */
  .mx-settings__pane {
    min-width: 0;
    min-inline-size: 0;
    overflow-y: auto;
    margin: 0;
    padding: var(--mx-space-4) var(--mx-space-6);
    border: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-3);
  }

  /* **縮ませない。** 縦に積んだ flex の子は既定で縮む。
     項目そのものは部品の側が同じ指定を持っている（スコープが跨がらないため）。 */
  .mx-settings__pane > * {
    flex: none;
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

  /* 残っているのはクロームのボタンだけ（入力欄は部品の側が自分で持つ）。 */
  .mx-settings button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings :disabled {
    opacity: 0.5;
  }
</style>
