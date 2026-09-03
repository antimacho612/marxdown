<!--
  ステータスバーの押せる項目。

  **押せるものだけがこの見た目になる**（03.ux-spec/07-status-and-notifications.md §3.1）。
  並べた story に混ぜてある素の `<span>`（BOM・文字数）との差が、
  そのまま「押せる / 押せない」の見分けになっている。
  メニューを開く側は `aria-expanded="true"` のあいだ光ったままになる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { ja } from '@/i18n/ja';

  import StatusBarButton from './StatusBarButton.svelte';

  const { Story } = defineMeta({
    title: 'シェル/components/ステータスバーの項目',
    component: StatusBarButton,
    parameters: { layout: 'fullscreen', controls: { disable: true } },
  });

  /** ステータスバーと同じ色と字の大きさ。クロームの grid は story に来ないので敷き直す。 */
  const BAR =
    'display: flex; align-items: center; gap: var(--mx-space-4); padding-inline: var(--mx-space-4);' +
    'height: 22px; background: var(--mx-color-bg-subtle); color: var(--mx-color-fg-muted);' +
    'border-top: 1px solid var(--mx-color-border-subtle); font-size: 11px; white-space: nowrap;';
</script>

{#snippet one()}
  <div style={BAR}>
    <StatusBarButton title={ja.status.zoomReset} onclick={() => {}}>100%</StatusBarButton>
  </div>
{/snippet}

<Story name="通常" template={one} />

<!-- 選択肢を開いている間。**どこから開いたか**が分かるように光ったままにする。 -->
{#snippet expanded()}
  <div style={BAR}>
    <StatusBarButton title={ja.status.modeSwitch} aria-haspopup="menu" aria-expanded={true} onclick={() => {}}>
      {ja.status.mode.preview}
    </StatusBarButton>
  </div>
{/snippet}

<Story name="開いている" template={expanded} />

{#snippet row()}
  <div style={BAR}>
    <StatusBarButton title={ja.status.modeSwitch} aria-haspopup="menu" onclick={() => {}}>
      {ja.status.mode.split}
    </StatusBarButton>
    <StatusBarButton title={ja.status.encodingReinterpret} aria-haspopup="menu" onclick={() => {}}>
      {ja.status.encoding.utf8}
    </StatusBarButton>
    <StatusBarButton title={ja.status.eolConvert('crlf')} onclick={() => {}}>LF</StatusBarButton>
    <!-- 押せない項目。**ボタンに見せない**（§3.1）。 -->
    <span>BOM</span>
    <span>{ja.status.chars(4210)}</span>
    <span style="flex: 1;"></span>
    <StatusBarButton title={ja.status.zoomReset} onclick={() => {}}>120%</StatusBarButton>
  </div>
{/snippet}

<Story name="並べた時" template={row} />
