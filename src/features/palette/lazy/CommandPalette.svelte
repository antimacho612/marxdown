<!--
  コマンドパレット（`Ctrl+Shift+P` / F-NAV-06 / 03.ux-spec/01-screen-layout.md §3）。

  メニューバーを置かない代わりの、すべての機能への到達手段である。
  並べるのは実行できるコマンドだけで、判定は `app/commands.ts` の `isListed` が唯一の根拠になる（メニューと結論がずれない / Principle 3）。

  外枠は `Palette.svelte` である。ここが持つのは「何を並べるか」だけである。
-->
<script lang="ts">
  import { ja } from '@/i18n/ja';
  import { runCommand, type CommandId } from '@/lib/commands';

  import { listedCommands } from './catalog';
  import Palette, { type PaletteItem } from './Palette.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  /**
   * 開いた時点の一覧を作る。
   *
   * 開いているあいだ状態は変わらない（パレットが前面にあり、他の操作が入らない）ため、1 回組み立てれば足りる。ラベルが状態で変わるもの（「編集する」/「プレビューに戻る」）も、開いた瞬間の状態で確定してよい。
   *
   * 英語キーワード（`keywords`）も渡す。ラベルが日本語しか無いため、これが無いと `save` と打っても 1 件も出てこない（`catalog.ts`）。
   */
  const items: PaletteItem[] = listedCommands()
    // 開いている当人は並べない。選んでも同じものが開くだけである。
    .filter((entry) => entry.id !== 'palette.open')
    .map((entry) => {
      const item: PaletteItem = { id: entry.id, label: entry.label, keywords: entry.keywords };
      return entry.shortcut === undefined ? item : { ...item, shortcut: entry.shortcut };
    });

  function run(id: string): void {
    runCommand(id as CommandId);
  }
</script>

<Palette
  label={ja.palette.title}
  placeholder={ja.palette.placeholder}
  {items}
  emptyText={ja.palette.noMatch}
  noMatchText={ja.palette.noMatch}
  onselect={run}
  {onclose}
/>
