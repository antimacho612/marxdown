<!--
  ブランドマーク。形のマスターは `src-tauri/icons/source.svg`（アプリアイコンと同じ）。
  直すときは必ずマスター側も直して `pnpm icons` を回すこと（食い違い防止）。
  クリティカルパスに載るのでインライン SVG で持つ。
  viewBox は実際の描画範囲だけを切り出し、谷の尖点を作るクリップ（`cw`/`ce`）以外の縁の光・接地影・台座は意図的に省いてある（既定 28px では効果が無い割にバイト数だけ増えるため）。
-->
<script lang="ts">
  interface Props {
    /** マークの高さ (px)。幅は viewBox の比から決まる。 */
    size?: number;
  }

  const { size = 28 }: Props = $props();

  /*
   * グラデーションとクリップの id は文書内で一意でないといけない。
   * Welcome では 1 度しか描かないが、Storybook では複数並ぶ。
   */
  const uid = $props.id();
</script>

<!-- 隣に「Marxdown」の見出しが出るので、マーク自体は読み上げ対象にしない -->
<svg
  class="mx-mark"
  viewBox="31.5 41.6 187.2 166.8"
  height={size}
  aria-hidden="true"
  focusable="false"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <clipPath id="{uid}-cw"><rect x="-64" y="-64" width="192" height="384" /></clipPath>
    <clipPath id="{uid}-ce"><rect x="128" y="-64" width="192" height="384" /></clipPath>
    <linearGradient id="{uid}-b" gradientUnits="userSpaceOnUse" x1="48" y1="54" x2="112" y2="206">
      <stop offset="0" stop-color="#8e9dff" />
      <stop offset="0.45" stop-color="#5566ee" />
      <stop offset="1" stop-color="#2f35b4" />
    </linearGradient>
    <linearGradient id="{uid}-r" gradientUnits="userSpaceOnUse" x1="146" y1="62" x2="212" y2="208">
      <stop offset="0" stop-color="#ff8fa8" />
      <stop offset="0.45" stop-color="#f2506a" />
      <stop offset="1" stop-color="#b81c46" />
    </linearGradient>
    <linearGradient id="{uid}-y" x1="0.14" y1="0.02" x2="0.86" y2="0.98">
      <stop offset="0" stop-color="#ffe9a3" />
      <stop offset="0.5" stop-color="#ffc44a" />
      <stop offset="1" stop-color="#e8940e" />
    </linearGradient>
  </defs>

  <g fill="none" stroke-width="42.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M58.75 184.55 L58.75 68.89 L158 214.33" stroke="url(#{uid}-b)" clip-path="url(#{uid}-cw)" />
    <path d="M197.25 184.55 L197.25 68.89 L98 214.33" stroke="url(#{uid}-r)" clip-path="url(#{uid}-ce)" />
  </g>

  <circle cx="58.75" cy="68.89" r="27.22" fill="url(#{uid}-y)" />
  <circle cx="197.25" cy="68.89" r="21.4" fill="url(#{uid}-y)" />
</svg>

<style>
  .mx-mark {
    display: block;
    width: auto;
    flex: none;
  }
</style>
