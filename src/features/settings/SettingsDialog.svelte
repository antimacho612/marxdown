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
  import { DEFAULT_SETTINGS, getPlatform, type Palette, type Settings, type SettingsProblem } from '@/platform';

  import { formatFontFamily, LIMITS, type NumericKey } from './appearance';
  import { changeSetting } from './change';
  import { ResetButton, Section } from './components';
  import { settingsStore } from './store.svelte';

  const { onclose }: { onclose: () => void } = $props();

  const uid = $props.id();

  const values = $derived(settingsStore.values);

  type CategoryId = 'appearance' | 'preview' | 'editor' | 'window';

  /** 値が文字列のキー。選択肢（`<select>` / ラジオ）とテキスト欄が該当する。 */
  type ChoiceKey = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings];
  /** 値が真偽のキー。チェックボックスが該当する。 */
  type ToggleKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

  interface Choice {
    value: string;
    label: string;
  }

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

  /** 見本に着せる配色。`default` は属性ごと外す（`applyPalette` と同じ判断）。 */
  function paletteAttr(palette: Palette): string | undefined {
    return palette === 'default' ? undefined : palette;
  }

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
    // 外部エディタで直された / 壊された瞬間に、この画面の見え方も変わる。
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

  /** 数値の入力。**空欄や範囲外では当てない**（打っている途中の状態を潰さない）。 */
  function onNumberInput(key: NumericKey, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const value = input.valueAsNumber;
    if (Number.isNaN(value)) return;
    const { min, max } = LIMITS[key];
    if (value < min || value > max) return;
    changeSetting(key, value);
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
    // 外部エディタでの編集か「既定に戻す」。入力欄を追いつかせる。
    rulersText = next;
    pushedRulers = next;
  });

  function onRulersInput(event: Event): void {
    const raw = (event.currentTarget as HTMLInputElement).value;
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

  /* ---------------------------------------------------------------- */
  /* 見本                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * エディタの見本に当てるスタイル。
   *
   * **エディタの設定はトークン層（CSS 変数）に出ない**ので、ここで組む。
   * 空欄のときの落とし先は `options.ts` と同じ `--mx-font-code`。
   *
   * **表示倍率は掛けない。** プレビューの見本（`--mx-font-size-content`）も
   * 掛けていないので、2 つの見本の縮尺が揃う。倍率は本文にしか掛からない。
   */
  const editorSampleStyle = $derived(
    [
      `font-family:${editorSampleFont()}`,
      `font-size:${String(values['editor.fontSize'])}px`,
      `line-height:${String(values['editor.lineHeight'])}`,
      `letter-spacing:${String(values['editor.letterSpacing'])}px`,
      `font-variant-ligatures:${values['editor.fontLigatures'] ? 'normal' : 'none'}`,
    ].join(';'),
  );

  function editorSampleFont(): string {
    const family = formatFontFamily(values['editor.fontFamily']);
    if (family === null) return 'var(--mx-font-code)';
    return `${family}, var(--mx-font-code-stack)`;
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
    <!--
      カテゴリ。**タブの ARIA ロールにしていない。**
      `tablist` を名乗ると矢印キーでの移動を自分で実装する義務が生まれる。
      素のボタンなら `Tab` だけで全部に届き、実装は 0 行で済む
      （03.ux-spec/10-accessibility.md「すべての操作がキーボードで到達可能」）。
    -->
    <nav class="mx-settings__nav" aria-label={ja.settings.title}>
      {#each CATEGORIES as item (item.id)}
        <button
          type="button"
          class="mx-settings__category"
          class:mx-settings__category--current={category === item.id}
          aria-current={category === item.id ? 'true' : undefined}
          onclick={() => (category = item.id)}
        >
          {item.label}
        </button>
      {/each}
    </nav>

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
        {@render contentSample()}
      {:else if category === 'editor'}
        {@render selectField('editor.theme', ja.settings.palette, PALETTES, ja.settings.paletteHint)}
        {@render editorSample()}

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

  <!--
    ファイルへの導線。**壊れていても押せる**（直す場所はファイルにしかない）。
    `fieldset` の外に置いてあるのがその実装。

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
      <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openEditorCssFile()}>
        {ja.customCss.openEditor}
      </button>
    </div>
    <p class="mx-settings__hint">{ja.settings.editHint}</p>
    <p class="mx-settings__hint">{ja.customCss.hint}</p>
    <p class="mx-settings__hint">{ja.customCss.hintEditor}</p>
  </footer>
</dialog>

<!-- MARK: Snippets -->
{#snippet resetButton(key: keyof Settings, label: string)}
  {#if customized(key)}
    <ResetButton title={ja.settings.resetOf(label)} onClick={() => changeSetting(key, null)} />
  {/if}
{/snippet}

{#snippet textField(key: ChoiceKey, label: string, hint: string)}
  <div class="mx-settings__field">
    <label class="mx-settings__label" for="{uid}-{key}">{label}</label>
    <div class="mx-settings__control">
      <div class="mx-settings__row">
        <input
          id="{uid}-{key}"
          type="text"
          class="mx-settings__text"
          spellcheck="false"
          autocomplete="off"
          placeholder={ja.settings.fontFamilyPlaceholder}
          value={values[key]}
          oninput={(e) => changeChoice(key, e.currentTarget.value)}
        />
        {@render resetButton(key, label)}
      </div>
      {#if hint}<p class="mx-settings__hint">{hint}</p>{/if}
    </div>
  </div>
{/snippet}

<!--
  数値。単位と補足だけが違うので 1 つにまとめる。
  **行間には単位を書かない**（`preview.lineHeight` / `editor.lineHeight`）。
  倍率（無次元）なので、`px` と並べると誤解を招く。
-->
{#snippet numberField(key: NumericKey, label: string, unit: string, hint: string)}
  <div class="mx-settings__field">
    <label class="mx-settings__label" for="{uid}-{key}">{label}</label>
    <div class="mx-settings__control">
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
        {#if unit}<span class="mx-settings__unit">{unit}</span>{/if}
        {@render resetButton(key, label)}
      </div>
      {#if hint}<p class="mx-settings__hint">{hint}</p>{/if}
    </div>
  </div>
{/snippet}

{#snippet selectField(key: ChoiceKey, label: string, options: Choice[], hint: string)}
  <div class="mx-settings__field">
    <label class="mx-settings__label" for="{uid}-{key}">{label}</label>
    <div class="mx-settings__control">
      <div class="mx-settings__row">
        <select
          id="{uid}-{key}"
          class="mx-settings__select"
          value={values[key]}
          onchange={(e) => changeChoice(key, e.currentTarget.value)}
        >
          {#each options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        {@render resetButton(key, label)}
      </div>
      {#if hint}<p class="mx-settings__hint">{hint}</p>{/if}
    </div>
  </div>
{/snippet}

<!--
  真偽値。**ラベルを「〜する」の形にして、チェックの意味を文にする。**
  「ミニマップ [✓]」だと、チェックが「表示」なのか「有効」なのか読めない。

  ラベル列を使わず 1 列に伸ばすのは、チェックボックスが**自分で自分を説明する**ため。
  左に名前、右に四角、では同じ言葉を 2 回書くことになる。
-->
{#snippet toggleField(key: ToggleKey, label: string)}
  <div class="mx-settings__field mx-settings__field--full">
    <div class="mx-settings__row">
      <label class="mx-settings__toggle">
        <input type="checkbox" checked={values[key]} onchange={(e) => changeSetting(key, e.currentTarget.checked)} />
        <span>{label}</span>
      </label>
      {@render resetButton(key, label)}
    </div>
  </div>
{/snippet}

<!--
  素のラジオボタンにしてある。同じ `name` を持つラジオは、矢印キーでの移動も
  Tab の扱い（グループ全体で 1 つ）も**ブラウザ側が実装している**。
  見た目のためにボタンで組み直すと、それを自分で書き直すことになる。

  `fieldset` / `legend` のままにしているのは、グループ名を読み上げに載せる方法として
  いちばん確実だから。**grid の 2 列に載せない**のは `legend` の配置がブラウザ差を持つため。
-->
{#snippet radioGroup(key: ChoiceKey, label: string, options: Choice[])}
  <fieldset class="mx-settings__field mx-settings__field--full mx-settings__group">
    <div class="mx-settings__row">
      <legend class="mx-settings__label">{label}</legend>
      {@render resetButton(key, label)}
    </div>
    <div class="mx-settings__choices">
      {#each options as option (option.value)}
        <label class="mx-settings__choice">
          <input
            type="radio"
            name="{uid}-{key}"
            value={option.value}
            checked={values[key] === option.value}
            onchange={() => changeChoice(key, option.value)}
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>
{/snippet}

{#snippet rulersField()}
  <div class="mx-settings__field">
    <label class="mx-settings__label" for="{uid}-rulers">{ja.settings.editor.rulers}</label>
    <div class="mx-settings__control">
      <div class="mx-settings__row">
        <input
          id="{uid}-rulers"
          type="text"
          class="mx-settings__text"
          spellcheck="false"
          autocomplete="off"
          inputmode="numeric"
          placeholder={ja.settings.editor.rulersPlaceholder}
          value={rulersText}
          oninput={onRulersInput}
        />
        {@render resetButton('editor.rulers', ja.settings.editor.rulers)}
      </div>
      <p class="mx-settings__hint">{ja.settings.editor.rulersHint}</p>
    </div>
  </div>
{/snippet}

<!-- 本文の見本。トークン層をそのまま着るので、当てる値は書かない。 -->
{#snippet contentSample()}
  <div class="mx-settings__sample mx-settings__sample--content" data-mx-theme={paletteAttr(values['preview.theme'])}>
    <strong class="mx-settings__sample-heading">{ja.settings.sampleHeading}</strong>
    <p class="mx-settings__sample-body">
      {ja.settings.sampleBody}
      <code class="mx-settings__sample-code-chip">code</code>
    </p>
  </div>
{/snippet}

<!-- エディタの見本。**設定は CSS 変数に出ない**ので、組んだスタイルを当てる。 -->
{#snippet editorSample()}
  <!--
    記法の色は **`theme.ts` の `tokenRules()` と同じ対応**で塗る。
    見出しとリストの記号は Monarch では 1 つのトークン（`keyword.md`）になり、
    `--mx-color-code-function` が当たっている。ここで別の色を使うと、
    見本と実物が食い違う。
  -->
  <div
    class="mx-settings__sample mx-settings__sample--code"
    style={editorSampleStyle}
    data-mx-theme={paletteAttr(values['editor.theme'])}
  >
    {#if values['editor.lineNumbers'] !== 'off'}
      <span class="mx-settings__sample-gutter" aria-hidden="true">1<br />2<br />3<br />4</span>
    {/if}
    <pre class="mx-settings__sample-code"><span class="mx-settings__syntax-structure"
        ># {ja.settings.sampleHeading}</span
      >

{ja.settings.sampleBody}<span class="mx-settings__syntax-inline">`code`</span>
<span class="mx-settings__syntax-structure">-</span> {ja.settings.sampleList}</pre>
  </div>
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

  .mx-settings__nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    padding: var(--mx-space-3) var(--mx-space-2);
    border-inline-end: 1px solid var(--mx-color-border-subtle);
  }

  .mx-settings__category {
    padding: var(--mx-space-2) var(--mx-space-3);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    font: inherit;
    text-align: start;
    cursor: default;
  }

  .mx-settings__category:hover {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
  }

  .mx-settings__category--current {
    background: var(--mx-color-bg-hover);
    color: var(--mx-color-fg);
    font-weight: 600;
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

  /* **縮ませない。** 縦に積んだ flex の子は既定で縮むので、
     器（見本）が中身より小さくなって内側にスクロールバーが生える。 */
  .mx-settings__pane > * {
    flex: none;
  }

  /*
   * 項目は**ラベル列 + 操作列の 2 列**。
   *
   * 1 列に積むと 22 項目でスクロールが長くなりすぎ、
   * 「どこに何があるか」を覚えられなくなる（M1.5 の 6 項目では成立していた）。
   */
  .mx-settings__field {
    margin: 0;
    padding: 0;
    border: none;
    min-inline-size: 0;
    display: grid;
    grid-template-columns: 10rem minmax(0, 1fr);
    align-items: start;
    gap: var(--mx-space-1) var(--mx-space-3);
  }

  /* チェックボックスとラジオのグループ。**ラベル列を使わない**（部品の側を参照）。 */
  .mx-settings__field--full {
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-2);
  }

  .mx-settings__control {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
  }

  .mx-settings__row {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  /* 入力欄の 1 行目と高さを揃える。`align-items: center` にすると、
     補足が付いた項目でラベルが下がって隣とずれる。 */
  .mx-settings__label {
    padding: 5px 0 0;
    color: var(--mx-color-fg-muted);
  }

  .mx-settings__field--full .mx-settings__label {
    flex: 1;
    padding: 0;
    color: var(--mx-color-fg);
    font-weight: 600;
  }

  .mx-settings__choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-1) var(--mx-space-4);
  }

  .mx-settings__choice,
  .mx-settings__toggle {
    display: flex;
    align-items: center;
    gap: var(--mx-space-2);
  }

  .mx-settings__toggle {
    flex: 1;
  }

  .mx-settings__text {
    flex: 1;
  }

  .mx-settings__text,
  .mx-settings__number,
  .mx-settings__select {
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
  }

  .mx-settings__select {
    min-width: 14rem;
  }

  /* **スピナーのぶんを含めて幅を取る。** `7ch` だと `100` が最後の桁で切れる。 */
  .mx-settings__number {
    width: 5.5rem;
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

  /*
   * 見本（ADR-0011）。**器はプレビューの面を真似ない。**
   * ここで見せたいのは文字の並びだけで、背景や余白まで似せると
   * 「これが本文の見た目そのもの」に読めてしまう。
   */
  .mx-settings__sample {
    padding: var(--mx-space-3);
    border: 1px solid var(--mx-color-border-subtle);
    border-radius: var(--mx-radius-sm);
    /*
     * **配色は見本自身に乗る**（`data-mx-theme` / ADR-0013）。
     * 背景と文字色をここで明示しないと、上書きしたトークンが誰にも読まれず、
     * ダイアログ（＝クロームの配色）のままになる。
     */
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    overflow-x: auto;
  }

  .mx-settings__sample--content {
    font-family: var(--mx-font-content);
    font-size: var(--mx-font-size-content);
    line-height: var(--mx-line-height);
  }

  .mx-settings__sample-heading {
    display: block;
    font-size: 1.25em;
  }

  .mx-settings__sample-body {
    margin: var(--mx-space-2) 0 0;
  }

  .mx-settings__sample--code {
    display: flex;
    gap: var(--mx-space-3);
  }

  .mx-settings__sample-gutter {
    flex: none;
    color: var(--mx-color-fg-subtle);
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .mx-settings__sample-code {
    margin: 0;
    font: inherit;
    letter-spacing: inherit;
    white-space: pre;
  }

  /* 見出し / リストの記号。`theme.ts` の `keyword.md` と同じトークン。 */
  .mx-settings__syntax-structure {
    color: var(--mx-color-code-function);
    font-weight: bold;
  }

  /* インラインコード。`theme.ts` の `variable.md` と同じトークン。 */
  .mx-settings__syntax-inline {
    color: var(--mx-color-code-builtin);
  }

  /* 本文の見本に混ぜるコード。**面の色が変わったことが分かる印**になる。 */
  .mx-settings__sample-code-chip {
    padding: 0 0.3em;
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-code-builtin);
    font-family: var(--mx-font-code);
    font-size: 0.9em;
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

  .mx-settings :is(input, button, select):focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-settings :disabled {
    opacity: 0.5;
  }
</style>
