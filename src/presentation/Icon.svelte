<script lang="ts">
  export let name = 'file';
  export let size = 18;
  const paths: Record<string, string> = {
    folder: 'M3 7V5h6l2 2h10v12H3V7Z',
    file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',
    code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16',
    chat: 'M4 4h16v12H9l-5 4V4Zm4 5h8m-8 3h5',
    settings:
      'm9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3H9Zm3 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
    branch:
      'M6 7v10m0-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v2a4 4 0 0 1-4 4H6',
    box: 'm3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10M8 5l9 4',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    chevron: 'm9 5 7 7-7 7',
    down: 'm6 9 6 6 6-6',
    close: 'm6 6 12 12M6 18 18 6',
    key: 'M15 3a6 6 0 1 1-4 10L5 19H2v-3l7-7a6 6 0 0 1 6-6Zm2 3v1',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3',
    spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
    terminal: 'm4 5 6 6-6 6m8 0h8',
    book: 'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3V4Zm9 2v15',
    refresh: 'M20 9a8 8 0 1 0 0 6m0-12v6h-6',
    check: 'm4 12 5 5L20 6',
    save: 'M4 3h13l3 3v15H4V3Zm4 0v6h8V3M8 21v-8h8v8',
    coffee: 'M4 8h13v9l-3 3H7l-3-3V8Zm13 0h2a3 3 0 0 1 0 6h-2M7 2v3m4-3v3m4-3v3',
    monitor: 'M3 3h18v13H3V3Zm5 18h8m-4-5v5',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name] ?? paths.file} /></svg
>
