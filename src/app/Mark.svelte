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

  墨の円は敷かない。円版（`source-disc.svg`）は 128px 以上で使うもので、
  ここの表示サイズ（既定 28px）では中身が潰れる。
-->
<script lang="ts">
  interface Props {
    /** マークの高さ (px)。幅は viewBox の比から決まる。 */
    size?: number;
  }

  const { size = 28 }: Props = $props();

  /*
   * グラデーションの id は文書内で一意でないといけない。
   * Welcome では 1 度しか描かないが、Storybook では複数並ぶ。
   */
  const uid = $props.id();
</script>

<!-- 隣に「Marxdown」の見出しが出るので、マーク自体は読み上げ対象にしない -->
<svg
  class="mx-mark"
  viewBox="29 8 204 215"
  height={size}
  aria-hidden="true"
  focusable="false"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <linearGradient id="{uid}-b" gradientUnits="userSpaceOnUse" x1="86" y1="48" x2="52" y2="212">
      <stop offset="0" stop-color="#5b7bf0" />
      <stop offset="1" stop-color="#2b45b4" />
    </linearGradient>
    <linearGradient id="{uid}-r" gradientUnits="userSpaceOnUse" x1="192" y1="84" x2="210" y2="210">
      <stop offset="0" stop-color="#f4626a" />
      <stop offset="1" stop-color="#c62630" />
    </linearGradient>
    <radialGradient id="{uid}-y" cx="0.36" cy="0.3" r="0.82">
      <stop offset="0" stop-color="#ffe694" />
      <stop offset="1" stop-color="#f2ac12" />
    </radialGradient>
  </defs>

  <g fill="none" stroke-width="46" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 200 C 70 176, 92 132, 86 58 L 136 156" stroke="url(#{uid}-b)" />
    <path d="M136 156 L 192 92 C 196 124, 202 164, 210 196" stroke="url(#{uid}-r)" />
  </g>

  <circle cx="74" cy="42" r="34" fill="url(#{uid}-y)" />
  <circle cx="200" cy="72" r="29" fill="url(#{uid}-y)" />
</svg>

<style>
  .mx-mark {
    display: block;
    width: auto;
    flex: none;
  }
</style>
