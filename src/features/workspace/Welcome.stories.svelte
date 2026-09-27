<!--
  Welcome 画面（F-OPEN-03 / F-OPEN-09）。

  履歴は Rust 側の永続化ストアから来るので、実アプリで「空の状態」を見るには `store.json` を消すしかない。ここでは `loaders` でストアに直接入れる。
-->
<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { recentStore } from './recent.svelte';
  import Welcome from './Welcome.svelte';

  const { Story } = defineMeta({
    title: '画面/Welcome',
    component: Welcome,
    parameters: { layout: 'fullscreen' },
  });

  /**
   * ストアはモジュールの singleton なので、story ごとに入れ直す。
   *
   * `loaders` を使うのは、描画より前に実行される唯一のフックだからである。
   * テンプレートの中で代入すると、描画中に状態を書き換えることになる。
   */
  function withRecent(paths: string[]) {
    return () => {
      recentStore.entries = paths.map((path, i) => ({ path, openedAtMs: i }));
    };
  }

  const SAMPLE = [
    'C:\\Users\\me\\repos\\marxdown\\README.md',
    'C:\\Users\\me\\repos\\marxdown\\docs.local\\00.design-brief.md',
    'C:\\Users\\me\\repos\\marxdown\\docs.local\\02.architecture/README.md',
  ];
</script>

<Story name="履歴あり" loaders={[withRecent(SAMPLE)]} />

<!-- 初回起動。ここに何を出すかが中心的な論点。 -->
<Story name="履歴なし" loaders={[withRecent([])]} />

<!--
  一覧に出すのは 6 件まで（`RECENT_SHOWN`）。
  ストアがそれ以上持っていても伸びないことを確認する story である。
  一覧が伸びると、Welcome が履歴の一覧という別の役割を持つことになる。
-->
<Story
  name="履歴が上限を超えている"
  loaders={[withRecent(Array.from({ length: 12 }, (_, i) => `C:\\Users\\me\\notes\\note-${String(i + 1)}.md`))]}
/>

<!-- 深いパスが省略記号で短縮され、末尾（＝現在地）が残ることの確認。 -->
<Story
  name="長いパス"
  loaders={[
    withRecent(['C:\\Users\\me\\Documents\\projects\\2026\\q3\\customer-a\\deliverables\\spec\\requirements.md']),
  ]}
/>
