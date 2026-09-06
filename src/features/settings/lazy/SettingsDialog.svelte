<!--
@component
設定 UI（F-CONF-05 / ADR-0011）。

遅延チャンクにあり、`Ctrl+,` かメニューの「設定」が押されるまでロードされない。

項目が 6 個から 28 個に増え 1 列に収まらなくなったため、モーダルダイアログ（カテゴリを持てる形）へ移した。
背後が見えなくなる代わりに、フォントまわりだけ見本を内蔵する（本文幅・折り返し・タブ幅は見本に出せないため出していない）。
フォーカストラップ・inert 化・`::backdrop` はブラウザの `<dialog>` に任せる。

並べる中身は `layout.ts` にあり、このファイルが持つのは「どの部品で描くか」だけである。
項目を足すときにここを触る必要はない。

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
  import { DEFAULT_SETTINGS, getPlatform, type SettingKey, type SettingsProblem } from '@/platform';

  import { settingsStore } from '../store.svelte';
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
  } from './components';
  import { LAYOUT, type CategoryId, type FieldEntry } from './layout';

  const { onclose }: { onclose: () => void } = $props();

  const values = $derived(settingsStore.values);

  /**
   * `settings.json` を読めていない事実。**ストアには置かない。**
   *
   * 「壊れている」を状態として 2 か所に持つと、直したあとに片方だけ残る
   * （`store.svelte.ts` の冒頭）。ここでは開いている間だけ、
   * 開いた時点と変更の通知が来た時点に読み直して持つ。
   */
  let broken = $state<SettingsProblem | null>(null);

  let dialog: HTMLDialogElement;

  let category = $state(lastCategory);

  $effect(() => {
    lastCategory = category;
  });

  const CATEGORIES = LAYOUT.map(({ id, label }) => ({ id, label }));

  const entries = $derived(LAYOUT.find((c) => c.id === category)?.entries ?? []);

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
   * 既定と違うか。「既定に戻す」を出すかどうかの判断がこれ 1 つで済む。
   *
   * **配列は中身で比べる。** `editor.rulers` は毎回別のオブジェクトになるので、
   * 参照で比べると触っていなくても「戻す」が出続ける。
   */
  function customized(key: SettingKey): boolean {
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
  function resetOf(key: SettingKey): (() => void) | undefined {
    if (!customized(key)) return undefined;
    return () => changeSetting(key, null);
  }

  /** 出す条件を持たない項目は常に出す。 */
  function visible(entry: FieldEntry): boolean {
    return entry.visibleWhen?.(values) ?? true;
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

    <!-- settings.json が壊れているときは `fieldset` でまとめて非活性にする。項目追加時の書き忘れ防止のため。 -->
    <fieldset class="mx-settings__pane" disabled={broken !== null}>
      {#each entries as entry, index (index)}
        {#if entry.kind === 'section'}
          <Section label={entry.label} />
        {:else if entry.kind === 'sample'}
          {#if entry.sample === 'content'}
            <ContentSample palette={values['preview.theme']} />
          {:else}
            <EditorSample
              palette={values['editor.theme']}
              fontFamily={values['editor.fontFamily']}
              fontSize={values['editor.fontSize']}
              lineHeight={values['editor.lineHeight']}
              letterSpacing={values['editor.letterSpacing']}
              ligatures={values['editor.fontLigatures']}
              showLineNumbers={values['editor.lineNumbers'] !== 'off'}
            />
          {/if}
        {:else if visible(entry)}
          {@render field(entry)}
        {/if}
      {/each}
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

{#snippet field(entry: FieldEntry)}
  {@const description = entry.description ?? ''}
  {#if entry.widget === 'text'}
    <TextField
      settingKey={entry.key}
      label={entry.label}
      {description}
      value={values[entry.key]}
      placeholder={entry.placeholder ?? ''}
      onInput={(value) => changeSetting(entry.key, value)}
      onReset={resetOf(entry.key)}
    />
  {:else if entry.widget === 'number'}
    <NumberField
      settingKey={entry.key}
      label={entry.label}
      {description}
      value={values[entry.key]}
      step={entry.step}
      onInput={(value) => changeSetting(entry.key, value)}
      onReset={resetOf(entry.key)}
    />
  {:else if entry.widget === 'select'}
    <SelectField
      settingKey={entry.key}
      label={entry.label}
      {description}
      labels={entry.labels}
      value={values[entry.key]}
      onChange={(value) => changeSetting(entry.key, value)}
      onReset={resetOf(entry.key)}
    />
  {:else if entry.widget === 'toggle'}
    <ToggleField
      settingKey={entry.key}
      label={entry.label}
      description={`${description}（既定値: ${String(DEFAULT_SETTINGS[entry.key])}）`}
      checked={values[entry.key]}
      onChange={(checked) => changeSetting(entry.key, checked)}
    />
  {:else if entry.widget === 'radio'}
    <RadioGroup
      settingKey={entry.key}
      label={entry.label}
      {description}
      labels={entry.labels}
      value={values[entry.key]}
      onChange={(value) => changeSetting(entry.key, value)}
    />
  {:else}
    <!-- 縦罫線だけは**打っている途中の文字列**を渡す（上の `rulersText` を参照）。 -->
    <TextField
      settingKey={entry.key}
      label={entry.label}
      {description}
      value={rulersText}
      placeholder={ja.settings.editor.rulers.placeholder}
      inputmode="numeric"
      onInput={onRulersInput}
      onReset={resetOf(entry.key)}
    />
  {/if}
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

    &[open] {
      display: flex;
    }

    &::backdrop {
      background: rgb(0 0 0 / 35%);
    }

    /*
   * 03.ux-spec/09-motion.md「パレットの出現 100ms ease-out」に揃える。
   * 本文の上に重なるものであり、本文のレイアウトには触らない（§1 の基準）。
   */
    &[open],
    &[open]::backdrop {
      animation: mx-settings-in 100ms ease-out;
    }

    &:focus {
      outline: none;
    }
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

    &:hover {
      background: var(--mx-color-bg-hover);
      color: var(--mx-color-fg);
    }
  }

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

  /*
   * 中身は `{@render}` 越しに入るため、Svelte の静的解析からは子要素が見えない。
   * `:global` を外すとこの規則ごと未使用と判定されて落ち、項目が縦に潰れる。
   */
  .mx-settings__pane > :global(*) {
    flex: none;
  }

  .mx-settings__footer {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-1);
    padding: var(--mx-space-3) var(--mx-space-4);
    border-top: 1px solid var(--mx-color-border-subtle);
  }

  .mx-settings__files {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mx-space-2);
    margin-bottom: var(--mx-space-1);
  }

  .mx-settings__file {
    padding: var(--mx-space-1) var(--mx-space-3);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
    cursor: default;

    &:hover {
      background: var(--mx-color-bg-hover);
    }
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
