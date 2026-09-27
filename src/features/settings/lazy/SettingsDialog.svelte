<!--
@component
設定 UI（F-CONF-05 / ADR-0011）。

遅延チャンクにあり、`Ctrl+,` かメニューの「設定」が押されるまでロードされない。

項目が多く 1 列に収まらないため、モーダルダイアログ（カテゴリを持てる形）にしている。
背後が見えなくなる代わりに、フォントまわりだけ見本を内蔵する（本文幅・折り返し・タブ幅は見本に出せないため出していない）。
フォーカストラップ・inert 化・`::backdrop` はブラウザの `<dialog>` に任せる。

並べる中身は `layout.ts` にあり、このファイルが持つのは「どの部品で描くか」だけである。
項目を追加するときにここを触る必要はない。

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
  let lastCategory: CategoryId = 'application';
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  import type ThemeFieldComponent from '@/features/theme/lazy/ThemeField.svelte';
  import { ja } from '@/i18n/ja';
  import CloseIcon from '@/lib/CloseIcon.svelte';
  import { DEFAULT_SETTINGS, getPlatform, type SettingKey, type SettingsProblem } from '@/platform';

  import { settingsStore } from '../store.svelte';
  import { changeSetting } from './change';
  import {
    ListField,
    Navigation,
    NumberField,
    RadioGroup,
    Section,
    SelectField,
    TextField,
    ToggleField,
  } from './components';
  import { LAYOUT, type CategoryId, type FieldEntry } from './layout';
  import { createRulerMemory, rulerColumn } from './rulers';
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
    return () => {
      if (key === 'editor.rulers') rulerMemory.forget();
      changeSetting(key, null);
    };
  }

  /** 表示条件を持たない項目は常に表示する。 */
  function visible(entry: FieldEntry): boolean {
    return entry.visibleWhen?.(values) ?? true;
  }

  /**
   * 見本の部品。読み込むまでは `null` で、その間は見本の場所に何も描かない。
   *
   * 見本を持つのは「プレビュー」「エディター」のカテゴリだけなので、設定を開いただけでは `sample` チャンクを読み込まない。
   * `{#await}` は使わない。
   * Svelte の await ブロックの実行時コードが遅延チャンクと `main` の共有チャンクへ切り出され、クリティカルパスが 0.35KB 増える。
   */
  let Sample = $state<typeof SampleComponent | null>(null);

  /**
   * 配色の選択（ADR-0014）。見本と同じ理由で遅延させる。
   *
   * こちらは選択肢を作るのに 50 枚ぶんの色を読み込むため、`settings` の予算ではなく `theme` の予算に含まれる。
   * 静的に import すると、設定を開いただけで配色の実体まで読み込まれる。
   */
  let ThemeField = $state<typeof ThemeFieldComponent | null>(null);

  // 2 つを 1 つの effect でまとめて扱う。どちらも「今のカテゴリで使うなら読み込む」だけである。
  $effect(() => {
    if (Sample === null && entries.some((entry) => entry.kind === 'sample')) {
      void import('./samples/Sample.svelte').then((module) => (Sample = module.default));
    }
    if (ThemeField === null && entries.some((entry) => entry.kind === 'field' && entry.widget === 'theme')) {
      void import('@/features/theme/lazy/ThemeField.svelte').then((module) => (ThemeField = module.default));
    }
  });

  /** 並びの項目のキー。`layout.ts` で `list` を指定したものだけがここに入る。 */
  type ListKey = Extract<FieldEntry, { widget: 'list' }>['key'];

  /** 縦罫線の色は画面に出さないため、桁を打ち直したときに引き継ぐ（`rulers.ts`）。 */
  const rulerMemory = createRulerMemory();

  /** 並びを入力欄の 1 行にする。縦罫線は桁だけを出す。 */
  function listText(key: ListKey): string {
    if (key === 'explorer.exclude' || key === 'editor.wordSegmenterLocales') return values[key].join(', ');
    return values[key].map(rulerColumn).join(', ');
  }

  /**
   * カンマ区切りの 1 行を並びとして解釈し、ストアへ反映する（`ListField.svelte`）。
   *
   * 反映した 1 行を返す。解釈できない場合は `null` を返し、入力欄の文字列だけが残る。
   * 空の要素を除くため、`dist, ` の末尾のカンマは値には現れない。
   */
  function onListInput(key: ListKey, raw: string): string | null {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (key === 'explorer.exclude' || key === 'editor.wordSegmenterLocales') {
      changeSetting(key, parts);
      return parts.join(', ');
    }

    // 縦罫線は数値の並びである。打っている途中（`80, ` の空欄や `8o` の打ち間違い）では適用しない。
    if (parts.some((part) => !/^\d+$/u.test(part))) return null;
    const columns = parts.map(Number);
    changeSetting(key, rulerMemory.restore(columns, values[key]));
    return columns.join(', ');
  }
</script>

<dialog
  class="mx-settings"
  aria-label={ja.settings.title}
  bind:this={dialog}
  onkeydown={onKeydown}
  onclick={onBackdropClick}
  oncancel={(e) => {
    // `Escape` は `onKeydown` で処理済み。ここへ来るのは他の閉じ要求（OS 側のジェスチャなど）なので、同じ処理を通す。
    e.preventDefault();
    close();
  }}
>
  <header class="mx-settings__header">
    <h2 class="mx-settings__title">{ja.settings.title}</h2>
    <button type="button" class="mx-settings__close" aria-label={ja.settings.close} onclick={close}>
      <CloseIcon />
    </button>
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
        surface={entry.key === 'preview.theme' ? 'preview' : 'editor'}
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
      description={`${description}（${ja.settings.defaultValue(DEFAULT_SETTINGS[entry.key])}）`}
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
  {:else if entry.widget === 'list'}
    <ListField
      settingKey={entry.key}
      label={entry.label}
      {description}
      value={listText(entry.key)}
      placeholder={entry.placeholder}
      inputmode={entry.key === 'editor.rulers' ? 'numeric' : 'text'}
      onInput={(raw) => onListInput(entry.key, raw)}
      onReset={resetOf(entry.key)}
    />
  {/if}
{/snippet}

<style>
  /*
   * トップレイヤに表示されるため、シェルの grid にも `z-index` にも関わらない。
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
    padding: var(--mx-space-3) var(--mx-space-3) var(--mx-space-3) var(--mx-space-6);
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
    display: grid;
    place-items: center;
    inline-size: var(--mx-control-height);
    block-size: var(--mx-control-height);
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

    &:active {
      background: var(--mx-color-bg-inset);
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

  /*
   * 多数の項目を 1 列に並べるため、行どうしの間隔がそのまま圧迫感になる。
   *
   * 項目の中（ラベルと説明）が 8px、項目どうしが 20px、節どうしが 40px。
   * 隣り合う段の差を 2 倍以上に保つと、読む側は数えずに「まとまり」を見分けられる。
   * 一律の間隔では、どこまでが 1 つの節なのかが罫線でしか分からない。
   */
  .mx-settings__pane {
    min-width: 0;
    min-inline-size: 0;
    overflow-y: auto;
    margin: 0;
    padding: var(--mx-space-6) var(--mx-space-8) var(--mx-space-10);
    border: none;
    display: flex;
    flex-direction: column;
    gap: var(--mx-space-5);
  }

  /*
   * 中身は `{@render}` 越しに入るため、Svelte の静的解析からは子要素が見えない。
   * `:global` を外すとこの規則ごと未使用と判定されて除去され、項目の配置が崩れる。
   */
  .mx-settings__pane > :global(*) {
    flex: none;
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
