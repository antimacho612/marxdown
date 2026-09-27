<!--
  ウィンドウ操作ボタン 1 つ。

  実アプリでは常に右上の 3 つ組でしか出てこないので、単体の状態（通常 / 閉じる / 外から与えたホバー）をここで比べる。
  閉じるだけホバーが赤いのと、幅が 46px 固定であることが要点。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { t } from '@/i18n';

  import CaptionButton from './CaptionButton.svelte';

  const { Story } = defineMeta({
    title: 'シェル/components/ウィンドウ操作ボタン',
    component: CaptionButton,
    parameters: { layout: 'fullscreen', controls: { disable: true } },
  });

  /** タイトルバーと同じ高さと色。クロームの grid（`shell.css`）は story に来ないので敷き直す。 */
  const BAR =
    'display: flex; justify-content: flex-end; height: var(--mx-titlebar-height);' +
    'background: var(--mx-color-bg-subtle); border-bottom: 1px solid var(--mx-color-border-subtle);';
</script>

{#snippet minimize()}
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
    <path d="M0 5h10" fill="none" stroke="currentColor" stroke-width="1" />
  </svg>
{/snippet}

{#snippet maximize()}
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />
  </svg>
{/snippet}

{#snippet restore()}
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <path d="M2.5 2.5V0.5h7v7h-2" />
      <rect x="0.5" y="2.5" width="7" height="7" />
    </g>
  </svg>
{/snippet}

{#snippet closeIcon()}
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" fill="none" stroke="currentColor" stroke-width="1" />
  </svg>
{/snippet}

{#snippet one()}
  <div style={BAR}>
    <CaptionButton label={t.titlebar.minimize} onClick={() => {}} children={minimize} />
  </div>
{/snippet}

<Story name="通常" template={one} />

<!-- ホバーしたときだけ赤くなる。置いてあるだけの状態では他と同じ色。 -->
{#snippet closing()}
  <div style={BAR}>
    <CaptionButton close label={t.titlebar.close} onClick={() => {}} children={closeIcon} />
  </div>
{/snippet}

<Story name="閉じる" template={closing} />

<!--
  外から与えたホバー。Snap Layouts の矩形には WebView のマウスイベントが届かないので、実アプリではここが Rust 側からの通知で強調される。
-->
{#snippet hovered()}
  <div style={BAR}>
    <CaptionButton hovered label={t.titlebar.maximize} onClick={() => {}} children={maximize} />
  </div>
{/snippet}

<Story name="外から与えたホバー" template={hovered} />

{#snippet trio()}
  <div style={BAR}>
    <CaptionButton label={t.titlebar.minimize} onClick={() => {}} children={minimize} />
    <CaptionButton label={t.titlebar.maximize} onClick={() => {}} children={maximize} />
    <CaptionButton close label={t.titlebar.close} onClick={() => {}} children={closeIcon} />
  </div>
{/snippet}

<Story name="ボタン 3 つ" template={trio} />

<!-- 最大化中。名前もアイコンも入れ替わる（片方だけだと読み上げと表示が一致しない）。 -->
{#snippet maximizedTrio()}
  <div style={BAR}>
    <CaptionButton label={t.titlebar.minimize} onClick={() => {}} children={minimize} />
    <CaptionButton label={t.titlebar.restore} onClick={() => {}} children={restore} />
    <CaptionButton close label={t.titlebar.close} onClick={() => {}} children={closeIcon} />
  </div>
{/snippet}

<Story name="最大化中" template={maximizedTrio} />
