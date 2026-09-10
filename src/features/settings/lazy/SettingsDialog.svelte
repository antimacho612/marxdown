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
   * 最後に開いていたカテゴリ。永続化はしない。
   *
   * 直前に表示していた位置は設定ファイルに残すほどの情報ではなく、同じセッションで開き直したときに復元できれば足りる。
   */
  let lastCategory: CategoryId = 'appearance';
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  import type ThemeFieldComponent from '@/features/theme/lazy/ThemeField.svelte';
  import { ja } from '@/i18n/ja';
  import { DEFAULT_SETTINGS, getPlatform, type SettingKey, type SettingsProblem } from '@/platform';

  import { settingsStore } from '../store.svelte';
  import { changeSetting } from './change';
  import { Navigation, NumberField, RadioGroup, Section, SelectField, TextField, ToggleField } from './components';
  import { LAYOUT, type CategoryId, type FieldEntry } from './layout';
  import type SampleComponent from './samples/Sample.svelte';

  const { onclose }: { onclose: () => void } = $props();

  const values = $derived(settingsStore.values);

  /**
   * `settings.json` を読めていない事実。ストアには置かない。
   *
   * 壊れているという状態を 2 か所に持つと、修正した後に片方だけ残る（`store.svelte.ts` の冒頭を参照）。
   * ここでは開いている間だけ、開いた時点と変更の通知を受けた時点に読み直して保持する。
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
    // `showModal()` で開く。
    // `open` 属性を指定すると非モーダルになり、フォーカストラップも `::backdrop` も適用されない。
    dialog.showModal();
    void reload();
    focusFirstControl();
    // 外部エディターで修正または破損した時点で、この画面の表示も変わる。
    // 値の適用は `installSettingsWatch` が行うため、ここで判定するのは保存できる状態かどうかだけである。
    const unwatch = getPlatform().onSettingsChanged(() => void reload());

    return () => {
      unwatch();
      // 明示的に閉じる。
      // 要素を削除するだけでもトップレイヤからは外れるが、開いたまま削除すると `open` の状態と DOM の有無が食い違う。
      if (dialog.open) dialog.close();
    };
  });

  /**
   * 先頭の操作要素へフォーカスを移す。
   * キーボード操作で開いた直後に `Tab` を繰り返さずに済むようにする（`AppMenu` と同じ扱い）。
   *
   * 移動先はカテゴリの見出しではなく、表示されている内容の先頭にする。
   * カテゴリは既に選択済みであり、操作の対象はその中身であるためである。
   */
  function focusFirstControl(): void {
    const pane = dialog.querySelector<HTMLElement>('.mx-settings__pane');
    (pane?.querySelector<HTMLElement>('input:checked') ?? pane?.querySelector<HTMLElement>('input, select'))?.focus();
  }

  function close(): void {
    onclose();
  }

  /**
   * `Escape` を処理する。プレビュー内検索など、グローバルに登録されている機能へは渡さない。
   *
   * `<dialog>` は `Escape` で自動的に閉じるが、そのキーイベントはダイアログの外まで伝播する。
   * ここで止めないと、閉じると同時に背後の検索も閉じる。
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    close();
  }

  /** 背景（`::backdrop`）を押したら閉じる。内容を押したときは閉じない。 */
  function onBackdropClick(event: MouseEvent): void {
    if (event.target === dialog) close();
  }

  /**
   * 既定と違うか。「既定に戻す」を出すかどうかの判断がこれ 1 つで済む。
   *
   * 配列は要素の内容で比較する。
   * `editor.rulers` は毎回別のオブジェクトになるため、参照で比較すると変更していなくても「既定に戻す」が表示され続ける。
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
   * 「既定に戻す」の処理。既定のままなら `undefined` を返す。
   *
   * 表示するかどうかの判断はここだけにある。
   * 部品側は渡されたときに表示するだけでよく、設定の既定値を知る必要がない。
   */
  function resetOf(key: SettingKey): (() => void) | undefined {
    if (!customized(key)) return undefined;
    return () => changeSetting(key, null);
  }

  /** 表示条件を持たない項目は常に表示する。 */
  function visible(entry: FieldEntry): boolean {
    return entry.visibleWhen?.(values) ?? true;
  }

  /**
   * 縦罫線だけは入力欄の文字列とストアの値が 1 対 1 で対応しない（`80, 100` と `[80, 100]`）。
   *
   * 値をそのまま `value` に渡すと、`80,` まで入力した時点で `80` に書き戻されてカンマが消える。
   * 入力途中の文字列はこのコンポーネント側で保持し、値として解釈できたときだけストアへ反映する。
   */
  // 初期値だけが要る。追従は下の `$effect` が担当する。
  // svelte-ignore state_referenced_locally
  let rulersText = $state(values['editor.rulers'].join(', '));
  /** このコンポーネントが反映した値。これと異なる値が届いた場合は外部で変更されたことを表す。 */
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

  /**
   * 見本の部品（OQ-38）。読み込むまでは `null` で、その間は見本の場所に何も描かない。
   *
   * 見本を持つのは「プレビュー」「エディター」のカテゴリだけなので、設定を開いただけでは `sample` チャンクを取りに行かない。
   * `{#await}` は使わない。
   * Svelte の await ブロックの実行時コードが遅延チャンクと `main` の共有チャンクへ切り出され、クリティカルパスが 0.35KB 太る。
   */
  let Sample = $state<typeof SampleComponent | null>(null);

  /**
   * 配色の選択（ADR-0014）。見本と同じ理由で遅延させる。
   *
   * こちらは選択肢を作るのに 50 枚ぶんの色を引くため、`settings` の予算ではなく `theme` の予算に載る。
   * 静的に import すると、設定を開いただけで配色の実体まで読み込まれる。
   */
  let ThemeField = $state<typeof ThemeFieldComponent | null>(null);

  // 2 つを 1 つの効果でまとめて見る。どちらも「今のカテゴリに出番があれば読む」でしかない。
  $effect(() => {
    if (Sample === null && entries.some((entry) => entry.kind === 'sample')) {
      void import('./samples/Sample.svelte').then((module) => (Sample = module.default));
    }
    if (ThemeField === null && entries.some((entry) => entry.kind === 'field' && entry.widget === 'theme')) {
      void import('@/features/theme/lazy/ThemeField.svelte').then((module) => (ThemeField = module.default));
    }
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
          {#if Sample}
            <Sample sample={entry.sample} {values} />
          {/if}
        {:else if visible(entry)}
          {@render field(entry)}
        {/if}
      {/each}
    </fieldset>
  </div>

  <!-- TODO: 削除。preview.css は「プレビュー」カテゴリの中に置く（themes フォルダーは `ThemeField` へ移した）。 -->
  <footer class="mx-settings__footer">
    <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openCustomCssFile()}>
      {ja.customCss.open}
    </button>
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
  {:else if entry.widget === 'theme'}
    {#if ThemeField}
      <ThemeField
        label={entry.label}
        {description}
        value={values[entry.key]}
        onChange={(value) => changeSetting(entry.key, value)}
        onReset={resetOf(entry.key)}
      />
    {/if}
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
    <!-- 縦罫線だけは入力途中の文字列を渡す（上の `rulersText` を参照）。 -->
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
