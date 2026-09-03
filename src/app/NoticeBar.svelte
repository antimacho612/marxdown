<!--
@component
通知バー（03.ux-spec/07-status-and-notifications.md §2）。

`role` を種別で分けているのは、支援技術に割り込ませるかどうかが変わるため。  
情報は `status`（穏やかに読み上げる）、警告とエラーは `alert`（割り込む）。
-->

<script lang="ts">
  import { documentStore, type Notice, type NoticeAction } from '@/features/document/store.svelte';
  import { ja } from '@/i18n/ja';

  const { notice }: { notice: Notice } = $props();

  function dismiss(): void {
    documentStore.notice = null;
  }

  function runAction(action: NoticeAction): void {
    dismiss();
    action.run();
  }
</script>

<div class="mx-notice mx-notice--{notice.level}" role={notice.level === 'info' ? 'status' : 'alert'}>
  <span class="mx-notice__message">{notice.message}</span>

  {#each notice.actions ?? [] as action (action.label)}
    <button type="button" class="mx-notice__action" onclick={() => runAction(action)}>
      {action.label}
    </button>
  {/each}

  <button type="button" class="mx-notice__close" aria-label={ja.notice.dismiss} onclick={dismiss}>✕</button>
</div>

<style>
  /* モーダルにせず、本文の上に重ねる。 */
  .mx-notice {
    grid-area: main;
    align-self: start;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--mx-space-3);
    padding: var(--mx-space-2) var(--mx-space-4);
    border-bottom: 1px solid var(--mx-color-border);
    background: var(--mx-color-bg-inset);
    font-size: var(--mx-font-size-ui);
    box-shadow: var(--mx-shadow-1);
    /* 出現に 150ms（03.ux-spec/09-motion.md） */
    animation: mx-notice-in 150ms ease-out;
  }

  /*
   * このバーは本文の上に重なっているので、動かしても再レイアウトが走らない。
   * サイドバー（`width` の遷移）を 0ms にしてあるのと、ここが 150ms なのは同じ基準の裏表である（07.open-questions/oq-26-motion-rules.md の推奨 B）。
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

  .mx-notice__message {
    flex: 1;
    min-width: 0;
  }

  /*
   * 通知内のボタン。
   * §2 が「自動で消えるものと、操作が必要なものを見分けられるように」と求めているので、選択肢は枠付き、閉じるだけは枠なしにして重みを変える。
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
    border: 1px solid currentColor;
  }

  .mx-notice__close {
    padding: 2px var(--mx-space-2);
    color: var(--mx-color-fg-subtle);
  }

  .mx-notice__action:hover,
  .mx-notice__close:hover {
    background: var(--mx-color-bg-hover);
  }

  .mx-notice__action:focus-visible,
  .mx-notice__close:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }

  .mx-notice--error {
    color: var(--mx-color-danger);
  }

  .mx-notice--warning {
    color: var(--mx-color-warning);
  }
</style>
