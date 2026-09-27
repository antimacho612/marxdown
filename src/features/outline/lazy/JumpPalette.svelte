<!--
  見出しへジャンプ（`Ctrl+Shift+O`）。

  パレットの外枠は `features/palette/lazy/Palette.svelte` と共有する。
  ここが持つのは「見出しをどう並べるか」だけである。

  アウトラインを見るのと見出しへ移動するのは別の意図なので、ペインは開かない（開くと移動した後も本文の幅が縮小したままになる）。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import Palette, { type PaletteItem } from '@/features/palette/lazy/Palette.svelte';
  import { t } from '@/i18n';

  import { jumpToHeading } from '../jump';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  const headings = $derived(documentStore.outline);

  /**
   * 行番号を id にする。見出しの文字列は重複しうるが、行は重複しない。
   * 階層は字下げ（`depth`）で、レベルは右端（`detail`）で表す。
   */
  const items = $derived<PaletteItem[]>(
    headings.map((heading) => ({
      id: String(heading.line),
      label: heading.text,
      detail: `H${heading.level}`,
      depth: heading.level - 1,
    })),
  );

  function jump(id: string): void {
    const heading = headings.find((item) => String(item.line) === id);
    if (heading) jumpToHeading(heading);
  }
</script>

<Palette
  label={t.outline.jump}
  placeholder={t.outline.jumpPlaceholder}
  {items}
  emptyText={t.outline.empty}
  noMatchText={t.outline.jumpNoMatch}
  onselect={jump}
  {onclose}
/>
