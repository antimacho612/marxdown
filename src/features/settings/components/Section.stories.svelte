<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Section from './Section.svelte';

  const { Story } = defineMeta({
    title: '設定/components/セクション',
    component: Section,
    parameters: { layout: 'fullscreen' },
  });
</script>

<Story name="通常" args={{ label: '通常のセクション' }} />

{#snippet multiple()}
  <div style="display: flex; flex-direction: column;">
    <Section label="セクション1" />
    <p>コンテンツ</p>
    <Section label="セクション2" />
    <p>コンテンツ</p>
    <Section label="セクション3" />
    <p>コンテンツ</p>
    <Section label="セクション4" />
    <p>コンテンツ</p>
  </div>
{/snippet}

<Story name="複数並んだ時" template={multiple} parameters={{ controls: { disable: true } }} />
