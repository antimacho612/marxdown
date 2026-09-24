<!--
@component
並びの設定項目（`editor.rulers` / `editor.wordSegmenterLocales` / `explorer.exclude`）。カンマ区切りの 1 行で編集する。

入力欄の文字列とストアの値が 1 対 1 で対応しない点が、ほかの項目と違う。
`80,` まで入力した時点で値（`[80]`）を書き戻すと、打ったばかりのカンマが消える。
そのため入力途中の文字列はここで保持し、外から届いた値と食い違ったときだけ追いつかせる。

解釈と保存は `onInput` の側にある。
このコンポーネントは「何を並びとして扱うか」を知らない。

@prop settingKey
@prop label
@prop description
@prop value
@prop placeholder
@prop inputmode
@prop onInput
@prop onReset
-->

<script lang="ts">
  import type { SettingKey } from '@/platform';

  import TextField from './TextField.svelte';

  interface Props {
    settingKey: SettingKey;
    label: string;
    description: string;
    /** ストアの値を 1 行に直したもの。入力欄の初期値になり、外部での変更を知る手がかりにもなる。 */
    value: string;
    placeholder: string;
    inputmode?: 'text' | 'numeric';
    /**
     * 入力のたびに呼ぶ。反映したときは反映後の 1 行を返し、反映しなかったときは `null` を返す。
     *
     * `null` を返すのは、打っている途中で値として解釈できない場合（`80, ` の空欄や `8o` の打ち間違い）である。
     */
    onInput: (raw: string) => string | null;
    /** リセット時のコールバック。未指定時は「既定に戻す」ボタン自体表示されない。 */
    onReset?: (() => void) | undefined;
  }

  const { settingKey, label, description, value, placeholder, inputmode = 'text', onInput, onReset }: Props = $props();

  // 初期値だけが要る。追従は下の `$effect` が担当する。
  // svelte-ignore state_referenced_locally
  let draft = $state(value);
  /** このコンポーネントが反映した値。これと異なる値が届いた場合は外部で変更されたことを表す。 */
  // 同上。
  // svelte-ignore state_referenced_locally
  let pushed = $state(value);

  $effect(() => {
    if (value === pushed) return;
    // 外部エディターでの編集か「既定に戻す」。入力欄を追いつかせる。
    draft = value;
    pushed = value;
  });

  function handle(raw: string): void {
    draft = raw;
    const committed = onInput(raw);
    if (committed !== null) pushed = committed;
  }
</script>

<TextField {settingKey} {label} {description} value={draft} {placeholder} {inputmode} onInput={handle} {onReset} />
