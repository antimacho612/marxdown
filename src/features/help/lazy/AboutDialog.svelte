<!--
@component
「Marxdown について」（F-OS-09 / ADR-0027）。

遅延チャンクにあり、ヘルプの「Marxdown について」が選ばれるまでロードされない。
設定と同じくモーダルの `<dialog>` で、フォーカストラップ・inert 化・`::backdrop` はブラウザに任せる。
設定以外のモーダルを置く理由は ADR-0027 にある。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { notifyStatus } from '@/features/document';
  import { t } from '@/i18n';
  import { tHelp } from '@/i18n/help';
  import CloseIcon from '@/lib/CloseIcon.svelte';
  import Mark from '@/lib/Mark.svelte';
  import type { AppInfo } from '@/platform';

  import { COPYRIGHT, describeInfo } from './links';
  import { appInfoOrNull } from './open';

  const { onclose }: { onclose: () => void } = $props();

  let dialog: HTMLDialogElement;

  /** 取得するまでは `undefined`、取得できなかったら `null`。 */
  let info = $state<AppInfo | null | undefined>(undefined);

  onMount(() => {
    dialog.showModal();
    void appInfoOrNull().then((loaded) => (info = loaded));

    return () => {
      // 開いたまま要素を削除すると `open` の状態と DOM の有無が食い違う（`SettingsDialog` と同じ）。
      if (dialog.open) dialog.close();
    };
  });

  async function copyInfo(): Promise<void> {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(describeInfo(info, tHelp.unknown));
      notifyStatus(tHelp.infoCopied);
    } catch {
      notifyStatus(tHelp.infoCopyFailed);
    }
  }

  /** 背後の検索などへ `Escape` を渡さない（`SettingsDialog` の `onKeydown` と同じ理由）。 */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    onclose();
  }

  function onBackdropClick(event: MouseEvent): void {
    if (event.target === dialog) onclose();
  }

  function field(key: 'version' | 'os' | 'webview'): string {
    if (info === undefined) return '…';
    return info?.[key] ?? tHelp.unknown;
  }
</script>

<dialog
  class="mx-about"
  aria-labelledby="mx-about-title"
  bind:this={dialog}
  onkeydown={onKeydown}
  onclick={onBackdropClick}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <button type="button" class="mx-about__close" aria-label={t.titlebar.close} onclick={onclose}>
    <CloseIcon />
  </button>

  <header class="mx-about__header">
    <Mark size={48} />
    <h2 class="mx-about__title" id="mx-about-title">Marxdown</h2>
  </header>

  <dl class="mx-about__info">
    <dt>{tHelp.version}</dt>
    <dd>{field('version')}</dd>
    <dt>OS</dt>
    <dd>{field('os')}</dd>
    <dt>WebView</dt>
    <dd>{field('webview')}</dd>
  </dl>

  <button type="button" class="mx-about__copy" disabled={!info} onclick={() => void copyInfo()}>
    {tHelp.copyInfo}
  </button>

  <p class="mx-about__legal">{COPYRIGHT}<br />{tHelp.license}</p>
</dialog>

<style>
  .mx-about {
    position: relative;
    width: min(360px, calc(100vw - 4rem));
    padding: var(--mx-space-8) var(--mx-space-6) var(--mx-space-5);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius);
    background: var(--mx-color-bg-subtle);
    box-shadow: var(--mx-shadow-1);
    font-family: var(--mx-font-ui);
    font-size: var(--mx-font-size-ui);
    color: var(--mx-color-fg);

    flex-direction: column;
    align-items: center;
    gap: var(--mx-space-4);

    &[open] {
      display: flex;
    }

    &::backdrop {
      background: rgb(0 0 0 / 35%);
    }

    /* 設定と同じく、パレットの出現（100ms ease-out）に揃える。 */
    &[open],
    &[open]::backdrop {
      animation: mx-about-in 100ms ease-out;
    }

    &:focus {
      outline: none;
    }
  }

  @keyframes mx-about-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mx-about[open],
    .mx-about[open]::backdrop {
      animation: none;
    }
  }

  .mx-about__close {
    position: absolute;
    inset-block-start: var(--mx-space-2);
    inset-inline-end: var(--mx-space-2);
    display: grid;
    place-items: center;
    inline-size: var(--mx-control-height);
    block-size: var(--mx-control-height);
    border: none;
    border-radius: var(--mx-radius-sm);
    background: none;
    color: var(--mx-color-fg-muted);
    cursor: default;

    &:hover {
      background: var(--mx-color-bg-hover);
      color: var(--mx-color-fg);
    }

    &:active {
      background: var(--mx-color-bg-inset);
    }
  }

  .mx-about__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--mx-space-2);
    text-align: center;
  }

  .mx-about__title {
    margin: 0;
    font-size: var(--mx-font-size-title);
    font-weight: 600;
  }

  .mx-about__info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--mx-space-1) var(--mx-space-4);
    align-self: stretch;
    margin: 0;
    padding: var(--mx-space-3) var(--mx-space-4);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg-inset);

    & dt {
      color: var(--mx-color-fg-subtle);
    }

    & dd {
      margin: 0;
      overflow-wrap: anywhere;
      user-select: text;
    }
  }

  .mx-about__copy {
    min-block-size: var(--mx-control-height);
    padding: 0 var(--mx-space-4);
    border: 1px solid var(--mx-color-border);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;
    cursor: default;

    &:hover:not(:disabled) {
      background: var(--mx-color-bg-hover);
    }

    &:active:not(:disabled) {
      background: var(--mx-color-bg-inset);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  .mx-about__legal {
    align-self: stretch;
    margin: 0;
    padding-block-start: var(--mx-space-4);
    border-top: 1px solid var(--mx-color-border-subtle);
    text-align: center;
    font-size: var(--mx-font-size-ui-sm);
    color: var(--mx-color-fg-subtle);
  }

  .mx-about button:focus-visible {
    outline: 2px solid var(--mx-color-accent);
    outline-offset: 1px;
  }
</style>
