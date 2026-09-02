<!--
  ブランドマーク。形のマスターは `src-tauri/icons/source.svg`（アプリアイコンと同じ）。

  形を直すときは **必ずマスター側も直して `pnpm icons` を回す**。
  ここだけ直すと、ウィンドウのアイコンと画面内のマークが食い違う。

  クリティカルパスに載るのでインライン SVG で持つ。画像ファイルにすると
  「本文が読める」までの経路にリクエストが 1 本増える（02.architecture/README.md）。

  viewBox はアイコン用の 256 角ではなく実際の描画範囲だけを切り出してある。
  文字の隣に置いたとき、アイコンの余白ぶんだけ小さく見えるのを避けるため。
  マスター側の `scale(1.125)` は 256 角いっぱいまで広げるためのものなので、
  切り出した側では不要。

  谷の尖点を作るクリップ（`cw` / `ce`）だけはマスターから持ってきている。
  ここを落とすと丸キャップ同士がぶつかって団子になり、M に見えなくなる。

  逆に、マスターが持っている玉の暗端・反射リム・ハイライトは **意図的に落としてある**。
  既定 28px では 1px 未満にしかならないのに、グラデーションとフィルタの定義ぶんだけ
  クリティカルパスのバイト数が増える。

  台座は敷かない。台座版（`source-plate.svg`）は 128px 以上で使うもので、
  ここの表示サイズ（既定 28px）では中身が潰れる。
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
  viewBox="29 10 204 213"
  height={size}
  aria-hidden="true"
  focusable="false"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <clipPath id="{uid}-cw"><path d="M185 -241 L 87 553 L -500 553 L -500 -241 Z" /></clipPath>
    <clipPath id="{uid}-ce"><path d="M185 -241 L 87 553 L 700 553 L 700 -241 Z" /></clipPath>
    <linearGradient id="{uid}-b" gradientUnits="userSpaceOnUse" x1="92" y1="40" x2="46" y2="215">
      <stop offset="0" stop-color="#7f97ff" />
      <stop offset="0.42" stop-color="#4a64e8" />
      <stop offset="1" stop-color="#2938ae" />
    </linearGradient>
    <linearGradient id="{uid}-r" gradientUnits="userSpaceOnUse" x1="182" y1="78" x2="216" y2="212">
      <stop offset="0" stop-color="#ff8189" />
      <stop offset="0.42" stop-color="#ee4753" />
      <stop offset="1" stop-color="#c31f2f" />
    </linearGradient>
    <radialGradient id="{uid}-y" cx="0.32" cy="0.24" r="0.9">
      <stop offset="0" stop-color="#fff3cd" />
      <stop offset="0.4" stop-color="#ffcf5e" />
      <stop offset="1" stop-color="#dd9410" />
    </radialGradient>
  </defs>

  <g fill="none" stroke-width="46" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 200 C 70 176, 92 132, 86 58 L 163.3 209.5" stroke="url(#{uid}-b)" clip-path="url(#{uid}-cw)" />
    <path d="M96.5 201.1 L 192 92 C 196 124, 202 164, 210 196" stroke="url(#{uid}-r)" clip-path="url(#{uid}-ce)" />
  </g>

  <circle cx="74" cy="42" r="32" fill="url(#{uid}-y)" />
  <circle cx="200" cy="72" r="27" fill="url(#{uid}-y)" />
</svg>

<style>
  .mx-mark {
    display: block;
    width: auto;
    flex: none;
  }
</style>
