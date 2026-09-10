<!--
@component
エディターの配色を選ぶ（ADR-0014）。

設定 UI の部品でありながら `theme` チャンク側に置いてある。
`SelectField` と分けたのは選択肢がスキーマの `values` から来ないためで、置き場所を分けたのは
そこで必ずカタログ（50 枚ぶんの色）を引くためである。`settings` チャンクに置くと、
設定を開いただけで配色の実体まで読み込まれる（`vite.config.ts` の `isThemeOnly`）。

選ばれている配色をこの場で当てるのは、見本のためである。
エディター側の適用は Monaco がマウントされているときにしか走らず、Preview のまま設定を開いた場合は誰も注入しない。
`applyTheme` は何度呼んでも同じ結果になるため、両方から呼んで差し支えない。

@prop label
@prop description
@prop value
@prop onChange
@prop onReset?
-->

<script lang="ts">
  import Field from '@/features/settings/lazy/components/Field.svelte';
  import { ja } from '@/i18n/ja';
  import { getPlatform } from '@/platform';

  import { applyTheme, listThemes, refreshUserThemes } from './catalog';
  import type { ThemeSummary } from './preset';

  interface Props {
    label: string;
    description: string;
    /** `editor.theme` の値。組み込みの id か `themes/` のファイル名、または `default`。 */
    value: string;
    onChange: (value: string) => void;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  let { label, description, value, onChange, onReset }: Props = $props();

  const id = $props.id();

  let themes = $state<ThemeSummary[]>([]);
  /** `themes/` を読み終えたか。読む前は「カタログに無い」と判定できない。 */
  let ready = $state(false);

  // 読み込みは 1 回だけ。`await` より前でリアクティブな値を読んでいないので、再実行されない。
  $effect(() => {
    let live = true;
    void refreshUserThemes().then(() => {
      if (!live) return;
      themes = listThemes();
      ready = true;
      return null;
    });
    return () => {
      live = false;
    };
  });

  $effect(() => {
    applyTheme(value);
  });

  /**
   * 明暗の別で束ねる。
   * 50 枚を 1 列に並べると、ライトの配色を探している人が全部を読むことになる。
   */
  const groups = $derived(
    [
      { label: ja.settings.editorPaletteGroups.user, items: pick((theme) => theme.user) },
      {
        label: ja.settings.editorPaletteGroups.both,
        items: pick((theme) => !theme.user && theme.scheme === undefined),
      },
      { label: ja.settings.editorPaletteGroups.light, items: pick((theme) => !theme.user && theme.scheme === 'light') },
      { label: ja.settings.editorPaletteGroups.dark, items: pick((theme) => !theme.user && theme.scheme === 'dark') },
    ].filter((group) => group.items.length > 0),
  );

  /**
   * 設定ファイルに書かれているが、カタログに無い綴り。
   *
   * 既定へ落とさないため（ADR-0014）、選択肢として残さないと `<select>` の表示が実際の値とずれる。
   * カタログを読み込む前も同じ状態になるが、そのあいだは何も出さない（読み込み後に一致する可能性がある）。
   */
  const missing = $derived(ready && value !== 'default' && themes.every((theme) => theme.id !== value) ? value : null);

  /**
   * 束の 1 つを取り出す。
   * 並びは表示名の昇順にする。定義順（系統ごと）のままだと、50 枚の中から目当ての名前を探せない。
   */
  function pick(match: (theme: ThemeSummary) => boolean): ThemeSummary[] {
    return themes.filter(match).toSorted((a, b) => a.label.localeCompare(b.label, 'en'));
  }
</script>

<Field {label} labelFor={id} tooltip="editor.theme" {description} {onReset}>
  <select {id} class="mx-settings__select" {value} onchange={(e) => onChange(e.currentTarget.value)}>
    <option value="default">{ja.settings.paletteOptions.default}</option>
    {#if missing !== null}
      <option value={missing}>{ja.settings.editorPaletteMissing(missing)}</option>
    {/if}
    {#each groups as group (group.label)}
      <optgroup label={group.label}>
        {#each group.items as theme (theme.id)}
          <option value={theme.id}>{theme.label}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
</Field>

<!--
  配色を追加する導線。設定ダイアログの下端ではなく選択肢の隣に置く。
  ここが「組み込みに無い配色は自分で足せる」と分かる唯一の場所である。
-->
<div class="mx-settings__theme-actions">
  <button type="button" class="mx-settings__file" onclick={() => void getPlatform().openThemesDir()}>
    {ja.settings.openThemes}
  </button>
</div>

<style>
  .mx-settings__theme-actions {
    display: flex;
    justify-content: flex-end;
  }

  .mx-settings__file {
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid transparent;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-accent);
    font: inherit;
    cursor: pointer;

    &:hover {
      background: var(--mx-color-bg-hover);
    }

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }
  }

  .mx-settings__select {
    min-width: 14rem;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;

    &:focus-visible {
      outline: 2px solid var(--mx-color-accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
    }
  }
</style>
