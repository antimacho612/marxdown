<!--
  見出しへジャンプ（`Ctrl+Shift+O` / 03.ux-spec/04-keybindings.md §3「移動」）。

  器は `features/palette/lazy/Palette.svelte` と共有する（M3 Phase 4）。
  ここが持つのは「見出しをどう並べるか」だけである。
  以前はこのファイルが器も兼ねており、コマンドパレットが入った時点で統合した。

  アウトラインを見るのと見出しへ飛ぶのは別の意図なので、ペインは開かない
  （開くと飛んだ後に本文の幅が縮小したままになる）。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import Palette, { type PaletteItem } from '@/features/palette/lazy/Palette.svelte';
  import { ja } from '@/i18n/ja';

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
  label={ja.outline.jump}
  placeholder={ja.outline.jumpPlaceholder}
  {items}
  emptyText={ja.outline.empty}
  noMatchText={ja.outline.jumpNoMatch}
  onselect={jump}
  {onclose}
/>
