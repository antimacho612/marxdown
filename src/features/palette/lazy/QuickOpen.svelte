<!--
  クイックオープン（`Ctrl+P` / F-NAV-05）。

  外枠は `Palette.svelte` である。ここが持つのは「何を並べるか」だけである（`CommandPalette.svelte` と同じ形）。
  並びは「最近開いたファイル → フォルダ内 Markdown」で、組み立ては `candidates.ts` にある。

  開くたびに走査する。
  結果を持ち回ると、その間に増えたファイルが出てこない。
  常駐アプリなので「前回」が数日前になりうる（ADR-0007）。
-->
<script lang="ts">
  import { documentStore } from '@/features/document';
  import { openPathInNewTab, recentStore, workspaceRoot } from '@/features/workspace';
  import { t } from '@/i18n';
  import { getPlatform } from '@/platform';

  import { buildCandidates, type FileCandidate } from './candidates';
  import Palette, { type PaletteItem } from './Palette.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  const root = workspaceRoot(documentStore.meta?.path ?? null);

  /** 走査を待たずに最近開いたファイルだけで描く。基点が無いときはこれで確定する。 */
  let candidates = $state<FileCandidate[]>(buildCandidates(root, [], recentStore.entries, t.quickOpen.recent));
  /** 上限で打ち切られたことの断り。全体を検索できていないことを伝える。 */
  let note = $state('');

  $effect(() => {
    if (root === null) return;

    let alive = true;
    void (async () => {
      try {
        const list = await getPlatform().listFiles(root);
        if (!alive) return;
        candidates = buildCandidates(root, list.files, recentStore.entries, t.quickOpen.recent);
        if (list.truncated) note = t.quickOpen.truncated(list.files.length);
      } catch {
        // 走査に失敗しても最近開いたファイルは並んでいる。通知は出さない。
      }
    })();

    return () => {
      alive = false;
    };
  });

  const items: PaletteItem[] = $derived(
    candidates.map((candidate) => ({ id: candidate.path, label: candidate.name, detail: candidate.detail })),
  );

  /** 既に開いているファイルを選んだ場合は、そのタブへ切り替わる（`openPathInNewTab`）。 */
  function open(path: string): void {
    void openPathInNewTab(path);
  }
</script>

<Palette
  label={t.quickOpen.title}
  placeholder={t.quickOpen.placeholder}
  {items}
  {note}
  emptyText={t.quickOpen.empty}
  noMatchText={t.quickOpen.noMatch}
  onselect={open}
  {onclose}
/>
