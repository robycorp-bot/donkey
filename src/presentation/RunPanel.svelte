<script lang="ts">
  import { onMount } from 'svelte';
  import { tools } from '../infrastructure/workspace-tools';
  import {
    localPreviewUrl,
    type ProjectScript,
    type ProjectState,
  } from '../domain/workspace-tools';
  export let isPreview = false;
  export let onPreview: (url: string) => void;
  let scripts: ProjectScript[] = [];
  let script = '';
  let state: ProjectState | null = null;
  let busy = false;
  let error = '';
  let scriptNotice = '';
  let url = '';
  let active = true;
  let polling = false;
  async function poll() {
    if (!active || isPreview || polling) return;
    polling = true;
    try {
      const next = await tools.state();
      if (active) {
        state = next;
        if (!url && next.url) url = next.url;
      }
    } catch (e) {
      if (active) error = String(e);
    } finally {
      polling = false;
    }
  }
  async function start(kind: 'script' | 'static' | 'install') {
    busy = true;
    error = '';
    url = '';
    try {
      state = await tools.start(kind, script);
      if (state.url) url = state.url;
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    } finally {
      busy = false;
    }
  }
  async function stop() {
    busy = true;
    try {
      await tools.stop();
      await poll();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
  function preview() {
    try {
      onPreview(localPreviewUrl(url));
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    }
  }
  async function browser() {
    try {
      await tools.openBrowser(localPreviewUrl(url));
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    }
  }
  onMount(() => {
    active = true;
    if (!isPreview) {
      tools
        .scripts()
        .then((items) => {
          if (active) {
            scripts = items;
            script = items.find((s) => s.name === 'dev')?.name ?? items[0]?.name ?? '';
          }
        })
        .catch(() => {
          scriptNotice = 'Sem package.json na raiz. Para HTML simples, use o servidor estático.';
        });
      void poll();
    }
    const interval = setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });
</script>

<h2>Veja sua ideia rodando.</h2>
<p class="modal-description">Execute um script npm ou abra um projeto HTML estático.</p>
{#if isPreview}<div class="info-box">
    Execução e servidores locais estão disponíveis no aplicativo instalado. Node.js/npm são
    necessários para projetos com scripts.
  </div>
{:else}
  <div class="run-state">
    <span class:live-dot={state?.running}></span>{state?.running
      ? state.label
      : state?.exitCode != null
        ? `Encerrado · código ${state.exitCode}`
        : 'Nenhuma execução ativa'}
  </div>
  <label class="field-label" for="run-script">Script do package.json</label><select
    id="run-script"
    class="text-field"
    bind:value={script}
    disabled={busy || state?.running || !scripts.length}
    >{#if !scripts.length}<option value="">Nenhum script disponível</option
      >{/if}{#each scripts as item}<option value={item.name}>{item.name} — {item.command}</option
      >{/each}</select
  >
  <div class="run-actions">
    <button
      class="primary-button"
      on:click={() => start('script')}
      disabled={busy || state?.running || !script}>Executar script</button
    ><button
      class="secondary-button"
      on:click={() => start('static')}
      disabled={busy || state?.running}>Live Server</button
    ><button class="secondary-button" on:click={stop} disabled={busy || !state?.running}
      >Parar</button
    >
  </div>
  {#if scriptNotice}<p class="field-note">{scriptNotice}</p>{/if}
  <button
    class="text-button install-deps"
    on:click={() => start('install')}
    disabled={busy || state?.running || !!scriptNotice}>Instalar dependências · npm install</button
  >
  <label class="field-label" for="preview-url">Endereço da prévia</label><input
    id="preview-url"
    class="text-field"
    placeholder="http://localhost:5173"
    bind:value={url}
  />
  <p class="field-note">
    O endereço é detectado nos logs. Você também pode informar a porta de um servidor local
    existente.
  </p>
  <div class="run-actions">
    <button class="primary-button" disabled={!url.trim() || busy} on:click={preview}
      >Ver no editor</button
    ><button class="secondary-button" disabled={!url.trim() || busy} on:click={browser}
      >Abrir no navegador</button
    >
  </div>
  <div class="change-heading">
    <h3>Saída do projeto</h3>
    <span>{state?.logs.length ?? 0} linhas</span>
  </div>
  <pre class="run-output" aria-label="Logs do projeto">{state?.logs.join('\n') ||
      'A saída do processo aparecerá aqui.'}</pre>
{/if}
{#if error}<p class="tool-error" role="alert">{error}</p>{/if}
