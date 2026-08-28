<!--
  通知バー（03.ux-spec/07-status-and-notifications.md §2）。

  実アプリでこの 3 段階を並べて見るには、読み込み失敗・外部変更・CLI 引数の誤りを
  それぞれ再現しないといけない。**Storybook を入れた理由がいちばん分かりやすいのがここ**。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import NoticeBar from './NoticeBar.svelte';

  const { Story } = defineMeta({
    title: 'シェル/通知バー',
    component: NoticeBar,
    // grid の 2 行目に置かれる前提のコンポーネントなので、同じ形の箱に入れて見る。
    parameters: { layout: 'fullscreen' },
  });
</script>

<Story name="情報" args={{ notice: { level: 'info', message: '外部の変更を読み込みました' } }} />

<Story name="警告" args={{ notice: { level: 'warning', message: '不明な引数: --foo' } }} />

<Story name="エラー" args={{ notice: { level: 'error', message: 'ファイルを開けませんでした: C:\\work\\a.md' } }} />

<!--
  操作が必要な通知。§8.2 が「自動で消えるものと見分けられるように」と求めているので、
  選択肢が枠付きで出ていることを目で確かめるのがこの story の目的。
-->
<Story
  name="選択肢つき"
  args={{
    notice: {
      level: 'warning',
      message: 'ファイルが外部で変更されました',
      actions: [
        { label: '再読み込み', run: () => {} },
        { label: '無視', run: () => {} },
      ],
    },
  }}
/>

<!-- 長い本文が 1 行に収まらないときに、閉じるボタンが押し出されないことの確認。 -->
<Story
  name="長いメッセージ"
  args={{
    notice: {
      level: 'error',
      message:
        '許可されていない場所のファイルです: C:\\Users\\someone\\very\\deep\\directory\\structure\\that\\keeps\\going\\document.md',
    },
  }}
/>
