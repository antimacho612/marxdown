<!--
  @component
  ファイルツリーの行の中で名前を受け取る入力欄。作成とリネームで共用する。

  ダイアログにしないのは、どの階層に作るのか・どの項目を変えるのかが入力中も見えているようにするためである。
  `Enter` で確定し、`Escape` と入力欄の外へのフォーカス移動で取り消す。
  使えない名前のあいだは理由を下に出し、確定させない（判定は `name.ts`）。
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { tExplorer } from '@/i18n/explorer';

  import { nameProblem, stemRange } from './name';

  interface Props {
    /** 入力欄の初期値。作成では空。 */
    initial: string;
    /** フォルダか。リネームで選択しておく範囲が変わる。 */
    dir: boolean;
    /** 同じ階層にある名前。衝突の検査に使う。 */
    siblings: readonly string[];
    /** リネーム中の項目の元の名前。作成では `null`。 */
    self: string | null;
    /** 字下げの段数。行の他の項目と左端を揃える。 */
    depth: number;
    oncommit: (name: string) => void;
    oncancel: () => void;
  }

  const { initial, dir, siblings, self, depth, oncommit, oncancel }: Props = $props();

  let input: HTMLInputElement;
  // 初期値は開いた時点の 1 回だけ使う。入力中に親から渡し直されても、打った内容を上書きしない。
  // svelte-ignore state_referenced_locally
  let value = $state(initial);
  /** 確定か取り消しを 1 回だけ通す。`Enter` の直後に来る `blur` で、取り消しが重ねて呼ばれないようにする。 */
  let settled = false;

  /** 何も打っていないうちは空欄を責めない。開いた直後から赤字が出ると、操作を誤ったように見える。 */
  let touched = $state(false);
  const problem = $derived(nameProblem(value, siblings, self));
  const shown = $derived(touched ? problem : problem === 'empty' ? null : problem);

  onMount(() => {
    input.focus();
    const [start, end] = stemRange(initial, dir);
    input.setSelectionRange(start, end);
  });

  function settle(run: () => void): void {
    if (settled) return;
    settled = true;
    run();
  }

  function onKeyDown(event: KeyboardEvent): void {
    // ツリーのキー操作（`F2` / `Delete` / 矢印）へ渡さない。入力中の文字の編集である。
    event.stopPropagation();
    // IME の変換を確定する `Enter` は、名前の確定に使わない。
    if (event.isComposing) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      touched = true;
      if (problem !== null) return;
      settle(() => oncommit(value));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      settle(oncancel);
    }
  }
</script>

<div class="mx-inline" style:padding-inline-start="calc(var(--mx-space-2) + {depth * 12}px + 30px)">
  <input
    class="mx-inline__input"
    class:mx-inline__input--invalid={shown !== null}
    type="text"
    spellcheck="false"
    autocomplete="off"
    aria-label={tExplorer.nameInput}
    aria-invalid={shown !== null}
    aria-describedby={shown === null ? undefined : 'mx-inline-problem'}
    bind:this={input}
    bind:value
    oninput={() => (touched = true)}
    onkeydown={onKeyDown}
    onblur={() => settle(oncancel)}
  />
  {#if shown !== null}
    <p id="mx-inline-problem" class="mx-inline__problem" role="alert">{tExplorer.nameProblem[shown]}</p>
  {/if}
</div>

<style>
  .mx-inline {
    padding-block: 1px;
    padding-inline-end: var(--mx-space-2);
  }

  .mx-inline__input {
    width: 100%;
    min-width: 0;
    padding: 1px var(--mx-space-1);
    border: 1px solid var(--mx-color-accent);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg);
    color: var(--mx-color-fg);
    font: inherit;

    &:focus-visible {
      outline: none;
    }
  }

  .mx-inline__input--invalid {
    border-color: var(--mx-color-danger);
  }

  .mx-inline__problem {
    margin: 2px 0 0;
    padding: var(--mx-space-1) var(--mx-space-2);
    border: 1px solid var(--mx-color-danger);
    border-radius: var(--mx-radius-sm);
    background: var(--mx-color-bg-subtle);
    color: var(--mx-color-fg);
    font-size: var(--mx-font-size-ui-sm);
    white-space: normal;
  }
</style>
