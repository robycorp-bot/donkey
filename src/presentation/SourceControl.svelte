<script lang="ts">
  import { onMount } from 'svelte';
  import { tools } from '../infrastructure/workspace-tools';
  import { isStaged, isUnstaged, type GitChange } from '../domain/workspace-tools';
  import { gitAct, gitBusy, gitMessage, gitState, refreshGit } from './git-store';
  import Icon from './Icon.svelte';

  export let isPreview = false;
  export let onOpenTerminal: () => void;

  let message = '';
  let newBranch = '';
  let remoteUrl = '';
  let editingRemote = false;
  let openDiff = '';
  let diffText = '';
  let diffLoading = false;

  $: state = $gitState;
  $: staged = state?.changes.filter(isStaged) ?? [];
  $: unstaged = state?.changes.filter(isUnstaged) ?? [];

  function label(code: string): string {
    return (
      { M: 'modificado', A: 'novo', D: 'removido', R: 'renomeado', '?': 'não rastreado', U: 'conflito' }[
        code
      ] ?? code
    );
  }
  function fileName(path: string) {
    return path.split('/').pop() ?? path;
  }
  function folder(path: string) {
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  }
  async function toggleDiff(change: GitChange, isStagedView: boolean) {
    const key = `${isStagedView ? 's' : 'w'}:${change.path}`;
    if (openDiff === key) {
      openDiff = '';
      return;
    }
    openDiff = key;
    diffLoading = true;
    diffText = '';
    try {
      diffText = (await tools.gitDiff(change.path, isStagedView)) || 'Sem diferenças de texto.';
    } catch (error) {
      diffText = error instanceof Error ? error.message : String(error);
    } finally {
      diffLoading = false;
    }
  }
  function lineClass(line: string) {
    if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
    if (line.startsWith('@@')) return 'hunk';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'del';
    return '';
  }
  async function commit(andPush: boolean) {
    if (!staged.length && unstaged.length) {
      if (!(await gitAct('stage_all'))) return;
    }
    if (await gitAct('commit', { message })) {
      message = '';
      if (andPush && $gitState?.remote) await gitAct('push');
    }
  }
  onMount(() => {
    void refreshGit();
  });
</script>

<div class="scm">
  {#if isPreview}
    <p class="scm-note">O Git funciona no aplicativo instalado, usando o Git e o login do seu computador.</p>
  {:else if !state}
    <p class="scm-note">Lendo o repositório...</p>
  {:else if !state.available}
    <p class="scm-note">
      Instale o Git para Windows e reabra o editor. O login no GitHub usa o Git Credential Manager.
    </p>
  {:else if !state.repository}
    <p class="scm-note">Esta pasta ainda não é um repositório Git.</p>
    <button class="primary-button scm-wide" disabled={$gitBusy} on:click={() => gitAct('init')}
      >Inicializar Git</button
    >
  {:else}
    <form class="scm-commit" on:submit|preventDefault={() => commit(false)}>
      <textarea
        class="text-field"
        placeholder={`Mensagem do commit (${state.branch})`}
        maxlength="8000"
        bind:value={message}
        disabled={$gitBusy}
        on:keydown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void commit(false);
          }
        }}></textarea>
      <div class="scm-commit-actions">
        <button
          class="primary-button"
          type="submit"
          disabled={$gitBusy || !message.trim() || !state.changes.length}
          title="Ctrl Enter · prepara tudo se nada estiver preparado"
          ><Icon name="check" size={14} />Commit</button
        ><button
          class="secondary-button"
          type="button"
          disabled={$gitBusy || !message.trim() || !state.changes.length || !state.remote}
          on:click={() => commit(true)}><Icon name="arrow" size={14} />Commit e enviar</button
        >
      </div>
    </form>

    {#if $gitMessage}<p class={$gitMessage.kind === 'error' ? 'tool-error' : 'tool-success'}>
        {$gitMessage.text}
      </p>{/if}

    <div class="scm-section">
      <span>Preparadas</span><b>{staged.length}</b>
    </div>
    {#each staged as change (change.path)}
      <div class="scm-row">
        <button class="scm-file" on:click={() => toggleDiff(change, true)} title={change.path}
          ><span class={`scm-badge s-${change.index === '?' ? 'U' : change.index}`}>{change.index}</span
          ><span class="scm-name">{fileName(change.path)}</span><span class="scm-dir"
            >{folder(change.path)}</span
          ></button
        ><button
          class="icon-button"
          title="Retirar"
          aria-label={`Retirar ${change.path}`}
          disabled={$gitBusy}
          on:click={() => gitAct('unstage', { path: change.path })}
          ><Icon name="close" size={13} /></button
        >
      </div>
      {#if openDiff === `s:${change.path}`}{@render diff()}{/if}
    {/each}

    <div class="scm-section">
      <span>Alterações</span><b>{unstaged.length}</b>
      {#if unstaged.length}<button
          class="scm-link"
          disabled={$gitBusy}
          on:click={() => gitAct('stage_all')}>+ tudo</button
        >{/if}
    </div>
    {#each unstaged as change (change.path)}
      <div class="scm-row">
        <button class="scm-file" on:click={() => toggleDiff(change, false)} title={change.path}
          ><span class={`scm-badge s-${change.worktree === '?' ? 'U' : change.worktree}`}
            >{change.worktree === '?' ? 'U' : change.worktree}</span
          ><span class="scm-name">{fileName(change.path)}</span><span class="scm-dir"
            >{folder(change.path)}</span
          ></button
        ><button
          class="icon-button"
          title={`Preparar (${label(change.worktree)})`}
          aria-label={`Preparar ${change.path}`}
          disabled={$gitBusy}
          on:click={() => gitAct('stage', { path: change.path })}
          ><Icon name="plus" size={13} /></button
        >
      </div>
      {#if openDiff === `w:${change.path}`}{@render diff()}{/if}
    {/each}
    {#if !state.changes.length}<p class="scm-note">Tudo em dia. Nenhuma alteração local.</p>{/if}

    <div class="scm-section"><span>Branch</span></div>
    <select
      class="text-field scm-wide"
      value={state.branch}
      disabled={$gitBusy}
      on:change={(event) => gitAct('switch', { branch: event.currentTarget.value })}
      >{#each state.branches.includes(state.branch) ? state.branches : [state.branch, ...state.branches] as name}<option
          value={name}>{name}</option
        >{/each}</select
    >
    <form class="inline-form" on:submit|preventDefault={async () => {
        if (await gitAct('branch', { branch: newBranch })) newBranch = '';
      }}>
      <input class="text-field" placeholder="Nova branch" bind:value={newBranch} disabled={$gitBusy} /><button
        class="secondary-button"
        disabled={$gitBusy || !newBranch.trim()}>Criar</button
      >
    </form>

    <div class="scm-section"><span>GitHub (origin)</span></div>
    {#if state.remote && !editingRemote}
      <div class="scm-remote">
        <span title={state.remoteUrl}>{state.remoteUrl}</span><button
          class="scm-link"
          on:click={() => {
            remoteUrl = state?.remoteUrl ?? '';
            editingRemote = true;
          }}>trocar</button
        >
      </div>
    {:else}
      <form class="inline-form" on:submit|preventDefault={async () => {
          if (await gitAct('remote', { message: remoteUrl })) editingRemote = false;
        }}>
        <input
          class="text-field"
          placeholder="https://github.com/usuario/repo.git"
          bind:value={remoteUrl}
          disabled={$gitBusy}
          spellcheck="false"
        /><button class="secondary-button" disabled={$gitBusy || !remoteUrl.trim()}>Vincular</button>
      </form>
      <p class="scm-hint">
        Crie o repositório vazio no GitHub e cole a URL. O login acontece no primeiro envio, pelo Git
        Credential Manager (abre o navegador).
      </p>
    {/if}

    <div class="scm-section"><span>Últimos commits</span></div>
    {#each state.commits as item}<div class="commit-row">
        <code>{item.hash}</code><span>{item.subject}</span>
      </div>{/each}
    {#if !state.commits.length}<p class="scm-note">Nenhum commit ainda.</p>{/if}

    <button class="scm-link scm-terminal" on:click={onOpenTerminal}
      ><Icon name="terminal" size={13} />Abrir terminal para comandos Git avançados</button
    >
  {/if}
</div>

{#snippet diff()}
  <pre class="scm-diff">{#if diffLoading}Carregando...{:else}{#each diffText.split('\n') as line}<span
          class={lineClass(line)}>{line || ' '}</span
        >{/each}{/if}</pre>
{/snippet}
