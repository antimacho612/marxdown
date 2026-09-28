<!--
  動きを付けたブランドマーク。形は `src/lib/Mark.svelte`（マスターは `src-tauri/icons/source.svg`）と同じ座標である。
  線を描き終えてから 2 つの玉（鈴）が載り、その後はゆっくり揺れる。動きは CSS（`landing.css` の `.amark`）が持つ。
-->
<script lang="ts">
  const { size = 72, label }: { size?: number; label?: string } = $props();
  const uid = $props.id();
</script>

<svg
  class="amark"
  viewBox="31.5 41.6 187.2 166.8"
  height={size}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
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
    <path
      class="amark__stroke amark__stroke--left"
      pathLength="1"
      d="M58.75 184.55 L58.75 68.89 L158 214.33"
      stroke="url(#{uid}-b)"
      clip-path="url(#{uid}-cw)"
    />
    <path
      class="amark__stroke amark__stroke--right"
      pathLength="1"
      d="M197.25 184.55 L197.25 68.89 L98 214.33"
      stroke="url(#{uid}-r)"
      clip-path="url(#{uid}-ce)"
    />
  </g>

  <g class="amark__bell amark__bell--left"><circle cx="58.75" cy="68.89" r="27.22" fill="url(#{uid}-y)" /></g>
  <g class="amark__bell amark__bell--right"><circle cx="197.25" cy="68.89" r="21.4" fill="url(#{uid}-y)" /></g>
</svg>
