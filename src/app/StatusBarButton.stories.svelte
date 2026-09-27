<!--
  ステータスバーの押せる項目。

  押せるものだけがこの見た目になる。
  並べた story に混ぜてある素の `<span>`（BOM・文字数）との差が、そのまま「押せる / 押せない」の見分けになっている。
  メニューを開く側は `aria-expanded="true"` のあいだ強調されたままになる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { t } from '@/i18n';

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
    <StatusBarButton title={t.status.zoomSelect} aria-haspopup="menu" onclick={() => {}}>100%</StatusBarButton>
  </div>
{/snippet}

<Story name="通常" template={one} />

<!-- 選択肢を開いている間。どこから開いたかが分かるように強調したままにする。 -->
{#snippet expanded()}
  <div style={BAR}>
    <StatusBarButton title={t.status.modeSwitch} aria-haspopup="menu" aria-expanded={true} onclick={() => {}}>
      {t.status.mode.preview}
    </StatusBarButton>
  </div>
{/snippet}

<Story name="開いている" template={expanded} />

{#snippet row()}
  <div style={BAR}>
    <StatusBarButton title={t.status.modeSwitch} aria-haspopup="menu" onclick={() => {}}>
      {t.status.mode.split}
    </StatusBarButton>
    <StatusBarButton title={t.status.encodingReinterpret} aria-haspopup="menu" onclick={() => {}}>
      {t.status.encoding.utf8}
    </StatusBarButton>
    <StatusBarButton title={t.status.eolConvert('crlf')} onclick={() => {}}>LF</StatusBarButton>
    <!-- 押せない項目。ボタンに見せない。 -->
    <span>BOM</span>
    <span>{t.status.chars(4210)}</span>
    <span style="flex: 1;"></span>
    <StatusBarButton title={t.status.zoomSelect} aria-haspopup="menu" onclick={() => {}}>120%</StatusBarButton>
  </div>
{/snippet}

<Story name="並べた時" template={row} />
