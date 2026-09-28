<!--
  線で描くアイコン。24px の格子で、線幅と端の形を揃えてある。
  GitHub のマークだけは塗りで、形は Octicons（MIT）の mark-github。
-->
<script lang="ts" module>
  const PATHS = {
    download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    external: 'M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    monitor: 'M3.5 5h17v11h-17zM8.5 20h7M12 16v4',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
    globe:
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c2.5 2.4 3.6 5.4 3.6 9s-1.1 6.6-3.6 9c-2.5-2.4-3.6-5.4-3.6-9S9.5 5.4 12 3z',
    menu: 'M4 7h16M4 12h16M4 17h16',
    close: 'M6 6l12 12M18 6 6 18',
    copy: 'M9 9h10v11H9zM15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    replay: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
    chevron: 'M9 6l6 6-6 6',
    outline: 'M5 6h14M9 11h10M9 16h10M5 11h.01M5 16h.01',
    slides: 'M3.5 5h17v11h-17zM12 16v4M8 20h8M8 9h8M8 12h5',
    export: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4M9.5 14.5 12 17l2.5-2.5M12 11v6',
    reload: 'M19.5 8.5A8 8 0 0 0 5 7M4.5 15.5A8 8 0 0 0 19 17M19.5 3.5v5h-5M4.5 20.5v-5h5',
    files: 'M8 3h7l4 4v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM15 3v4h4M4 7v13a1 1 0 0 0 1 1h10',
    pipe: 'M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4',
    language: 'M4 6h8M8 4v2M5.5 6c.8 3.3 2.9 5.6 5.5 6.8M10.5 6c-.8 3.6-3 6.2-6 7.5M13 20l3.5-9 3.5 9M14.2 17h4.6',
    update: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 16.5v-9M8.5 11 12 7.5l3.5 3.5',
    folder: 'M3.5 7a1 1 0 0 1 1-1H10l2 2.5h7.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z',
    shield: 'M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z',
    file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4',
  } as const;

  export type IconName = keyof typeof PATHS | 'github';
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
  }

  const { name, size = 20 }: Props = $props();

  const GITHUB =
    'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';
</script>

{#if name === 'github'}
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={GITHUB} />
  </svg>
{:else}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={PATHS[name]} />
  </svg>
{/if}
