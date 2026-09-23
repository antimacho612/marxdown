<!--
@component
通知バー（03.ux-spec/07-status-and-notifications.md §2）。

`role` を種別で分けているのは、支援技術に割り込ませるかどうかが変わるため。
情報は `status`（穏やかに読み上げる）、警告とエラーは `alert`（割り込む）。

種別はアイコンでも表す。
色だけで分けると、警告（#8a5a00）とエラー（#bc2020）が P 型・D 型色覚でほぼ同じ褐色になり、「上書きすると相手の変更を壊す」警告とただのエラーを見分けられない。
-->

<script lang="ts">
  import { documentStore, type Notice, type NoticeAction } from '@/features/document';
  import { ja } from '@/i18n/ja';
  import CloseIcon from '@/lib/CloseIcon.svelte';

  const { notice }: { notice: Notice } = $props();

  function dismiss(): void {
    documentStore.notice = null;
  }

  function runAction(action: NoticeAction): void {
    dismiss();
    action.run();
  }
</script>

<div class="mx-notice mx-over-main mx-notice--{notice.level}" role={notice.level === 'info' ? 'status' : 'alert'}>
  <!--
    種別の印。読み上げには `role` が載っているため、ここは視覚的な冗長キューに徹する。
    情報 = 丸に i / 警告 = 三角に ! / エラー = 丸に ✕。輪郭だけで見分けられる形を選んである。
  -->
  <svg class="mx-notice__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    {#if notice.level === 'warning'}
      <path d="M8 2.2 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      <path d="M8 6.4v3.2M8 11.6v.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    {:else if notice.level === 'error'}
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.3" />
      <path
        d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
      />
    {:else}
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.3" />
      <path d="M8 7.2v4M8 4.6v.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    {/if}
  </svg>

  <span class="mx-notice__message">{notice.message}</span>

  {#each notice.actions ?? [] as action (action.label)}
    <button type="button" class="mx-notice__action" onclick={() => runAction(action)}>
      {action.label}
    </button>
  {/each}

  <button type="button" class="mx-notice__close" aria-label={ja.notice.dismiss} onclick={dismiss}>
    <CloseIcon />
  </button>
</div>

<style>
  /* モーダルにせず、本文の上に重ねる。置き場所は `shell.css` の `.mx-over-main` が持つ。 */
  .mx-notice {
    align-self: start;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--mx-space-3);
    padding: var(--mx-space-2) var(--mx-space-4);
    /* 種別の色は左端の線でも出す。アイコンと合わせて、色以外の手がかりを 2 つ持たせる。 */
    border-left: 3px solid currentcolor;
    border-bottom: 1px solid var(--mx-color-border);
    background: var(--mx-color-bg-inset);
    font-size: var(--mx-font-size-ui);
    box-shadow: var(--mx-shadow-1);
    /* 出現に 150ms（03.ux-spec/09-motion.md） */
    animation: mx-notice-in 150ms ease-out;
  }

  /*
   * このバーは本文の上に重なっているため、動かしても再レイアウトが発生しない。
   * サイドバー（`width` の遷移）を 0ms にしてあるのと、ここが 150ms なのは同じ基準による（03.ux-spec/09-motion.md §1）。
   */
  @keyframes mx-notice-in {
    from {
      opacity: 0;
      translate: 0 -4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mx-notice {
      animation: none;
    }
  }

  .mx-notice__icon {
    flex: none;
  }

  /*
   * 本文だけは選択できるようにする（`reset.css` は `body` 全体で選択を切っている）。
   * エラーの文面は検索したり貼り付けたりする対象であり、読むだけのものではない。
   */
  .mx-notice__message {
    flex: 1;
    min-width: 0;
    user-select: text;
  }

  /*
   * 通知内のボタン。
   * §2 が「自動で消えるものと、操作が必要なものを見分けられるように」と定めているため、選択肢は枠付き、閉じるだけは枠なしにして区別する。
   */
  .mx-notice__action,
  .mx-notice__close {
    flex: none;
    color: inherit;
    font: inherit;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--mx-radius-sm);
  }

  .mx-notice__action {
    padding: 2px var(--mx-space-3);
    border: 1px solid currentcolor;
  }

  .mx-notice__close {
    display: flex;
    align-items: center;
    padding: var(--mx-space-1) var(--mx-space-2);
    color: var(--mx-color-fg-subtle);
  }

  /*
   * ホバーの面は種別の色から作る。
   * 中立の灰色を敷くと、赤や黄の文字との組み合わせでコントラストが 4.5:1 を割る。
   */
  .mx-notice__action:hover,
  .mx-notice__close:hover {
    background: color-mix(in srgb, currentcolor 12%, transparent);
  }

  .mx-notice__close:hover {
    color: var(--mx-color-fg);
  }

  .mx-notice__action:active,
  .mx-notice__close:active {
    background: color-mix(in srgb, currentcolor 20%, transparent);
  }

  .mx-notice__action:focus-visible,
  .mx-notice__close:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-notice--info {
    color: var(--mx-color-fg-muted);
  }

  .mx-notice--info .mx-notice__message {
    color: var(--mx-color-fg);
  }

  .mx-notice--error {
    color: var(--mx-color-danger);
  }

  .mx-notice--warning {
    color: var(--mx-color-warning);
  }
</style>
