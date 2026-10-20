<script lang="ts">
  import { tools } from '../infrastructure/workspace-tools';
  import Icon from './Icon.svelte';
  export let url: string;
  export let revision = 0;
  export let onClose: () => void;
  let error = '';
  async function browser() {
    try {
      await tools.openBrowser(url);
    } catch (e) {
      error = String(e);
    }
  }
</script>

<section class="project-preview">
  <div class="preview-toolbar">
    <span title={url}>{url}</span><button
      class="icon-button"
      on:click={() => (revision += 1)}
      aria-label="Atualizar prévia"
      title="Atualizar prévia"><Icon name="refresh" size={16} /></button
    ><button class="secondary-button" on:click={browser}>No navegador</button><button
      class="icon-button"
      on:click={onClose}
      aria-label="Voltar ao código"
      title="Voltar ao código"><Icon name="close" size={16} /></button
    >
  </div>
  {#if error}<p class="tool-error">{error}</p>{/if}{#key `${url}:${revision}`}<iframe
      title="Prévia do projeto"
      src={url}
      sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
    ></iframe>{/key}
  <p class="preview-help">
    Se o projeto impedir incorporação ou precisar de recursos extras do navegador, use “No
    navegador”.
  </p>
</section>
