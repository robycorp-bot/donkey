<script lang="ts">
  import { tick } from 'svelte';
  import { tools } from '../infrastructure/workspace-tools';
  import { refreshGit } from './git-store';
  import { track } from './ai-store';
  import Icon from './Icon.svelte';

  export let isPreview = false;
  export let cwd = '';
  export let onClose: () => void;
  export let onFilesChanged: () => void;

  type Entry = { command: string; output: string; code: number | null; running: boolean };
  let entries: Entry[] = [];
  let input = '';
  let history: string[] = [];
  let cursor = -1;
  let running = false;
  let scroller: HTMLDivElement;
  let field: HTMLInputElement;

  const QUICK = ['git status', 'git pull', 'git push', 'git log --oneline -10', 'npm install'];

  export function focus() {
    field?.focus();
  }

  async function run(command = input) {
    command = command.trim();
    if (!command || running) return;
    if (command === 'clear' || command === 'cls') {
      entries = [];
      input = '';
      return;
    }
    history = [...history.filter((item) => item !== command), command].slice(-100);
    cursor = -1;
    input = '';
    running = true;
    const entry: Entry = { command, output: '', code: null, running: true };
    entries = [...entries.slice(-99), entry];
    await scroll();
    try {
      if (isPreview) throw new Error('O terminal funciona no aplicativo instalado.');
      const result = await tools.terminal(command);
      entry.output = result.timedOut
        ? `${result.output}\n[interrompido após 3 minutos — use o terminal do sistema para processos longos]`
        : result.output;
      entry.code = result.exitCode;
      track('terminal', `${command} → ${result.timedOut ? 'tempo esgotado' : `código ${result.exitCode ?? '?'}`}`);
    } catch (error) {
      entry.output = error instanceof Error ? error.message : String(error);
      entry.code = 1;
    } finally {
      entry.running = false;
      entries = entries;
      running = false;
      await scroll();
      field?.focus();
      void refreshGit(true);
      onFilesChanged();
      if (!isPreview) void tools.liveReload().catch(() => {});
    }
  }
  async function scroll() {
    await tick();
    // Scrolling is cosmetic: it must never block a command.
    try {
      scroller?.scrollTo({ top: scroller.scrollHeight });
    } catch {
      /* ignore */
    }
  }
  function keys(event: KeyboardEvent) {
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      cursor = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1);
      input = history[cursor];
    } else if (event.key === 'ArrowDown' && cursor >= 0) {
      event.preventDefault();
      cursor = cursor + 1 >= history.length ? -1 : cursor + 1;
      input = cursor < 0 ? '' : history[cursor];
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      entries = [];
    }
  }
</script>

<section class="terminal">
  <div class="terminal-head">
    <span><Icon name="terminal" size={13} />Terminal <small>{cwd}</small></span>
    <div class="terminal-quick">
      {#each QUICK as command}<button disabled={running} on:click={() => run(command)}
          >{command}</button
        >{/each}
      <button class="icon-button" title="Limpar · Ctrl L" aria-label="Limpar terminal" on:click={() => (entries = [])}
        ><Icon name="refresh" size={13} /></button
      ><button class="icon-button" aria-label="Fechar terminal" title="Fechar · Ctrl `" on:click={onClose}
        ><Icon name="close" size={13} /></button
      >
    </div>
  </div>
  <div class="terminal-body" bind:this={scroller}>
    {#if !entries.length}<p class="terminal-hint">
        Comandos rodam na pasta do projeto (git, npm, node...). Não é interativo: comandos que pedem
        digitação ficam sem resposta. ↑ ↓ navegam no histórico.
      </p>{/if}
    {#each entries as entry}
      <div class="terminal-entry">
        <div class="terminal-cmd"><span>❯</span>{entry.command}</div>
        {#if entry.running}<div class="terminal-out muted">executando...</div>
        {:else if entry.output}<pre class="terminal-out" class:failed={entry.code !== 0}>{entry.output}</pre>{/if}
        {#if !entry.running && entry.code !== 0 && entry.code !== null}<div class="terminal-code">
            código de saída {entry.code}
          </div>{/if}
      </div>
    {/each}
  </div>
  <form class="terminal-input" on:submit|preventDefault={() => run()}>
    <span>❯</span><input
      bind:this={field}
      bind:value={input}
      on:keydown={keys}
      placeholder={running ? 'Aguarde o comando terminar...' : 'git commit -am "mensagem"'}
      spellcheck="false"
      autocomplete="off"
      disabled={running}
      aria-label="Comando do terminal"
    />
  </form>
</section>
