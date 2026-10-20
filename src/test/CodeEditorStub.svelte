<script lang="ts">
  /* Test double for the Monaco editor: same props, a plain textarea. */
  export let path = '';
  export let value = '';
  export let language = '';
  export let openPaths: string[] = [];
  export let readOnly = false;
  export let visible = true;
  export let retro = false;
  export let onChange: (path: string, value: string) => void;
  export let onPosition: (line: number, column: number) => void = () => {};
  export function insertText(text: string): boolean {
    if (readOnly || !path) return false;
    onChange(path, value + text);
    return true;
  }
  $: void openPaths;
  $: void visible;
  $: void onPosition;
</script>

<textarea
  aria-label="editor"
  data-path={path}
  data-language={language}
  data-retro={String(retro)}
  readonly={readOnly}
  {value}
  on:input={(event) => onChange(path, event.currentTarget.value)}
></textarea>
