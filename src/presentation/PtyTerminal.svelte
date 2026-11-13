<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { tools } from '../infrastructure/workspace-tools';
  import { PTY_SHELLS, type PtyShell } from '../domain/workspace-tools';
  import Icon from './Icon.svelte';

  export let cwd = '';
  export let onClose: () => void;
  export let onFilesChanged: () => void;

  const SHELL_KEY = 'cmb.ptyShell';
  let shell: PtyShell = 'powershell';
  try {
    const saved = localStorage.getItem(SHELL_KEY) as PtyShell | null;
    if (saved && PTY_SHELLS.some((item) => item.id === saved)) shell = saved;
  } catch {
    /* storage can be blocked */
  }

  let host: HTMLDivElement;
  let term: Terminal;
  let fit: FitAddon;
  let sessionId: number | null = null;
  let ended = false;
  let error = '';
  let unlisten: Array<() => void> = [];
  let observer: ResizeObserver | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let typedAt = 0;

  export function focus() {
    term?.focus();
  }

  const css = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  function theme() {
    return {
      background: css('--term-bg', '#1c2438'),
      foreground: css('--term-fg', '#d3daea'),
      cursor: '#d3daea',
      cursorAccent: '#1c2438',
      selectionBackground: '#6f8fc966',
    };
  }

  /** After the user ran something, tell the app files may have changed once output settles. */
  function scheduleRefresh() {
    if (Date.now() - typedAt > 30_000) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(onFilesChanged, 1500);
  }

  async function start() {
    error = '';
    ended = false;
    term.reset();
    try {
      fit.fit();
      sessionId = await tools.ptyOpen(shell, term.cols, term.rows);
      term.focus();
    } catch (cause) {
      sessionId = null;
      ended = true;
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function stop() {
    const id = sessionId;
    sessionId = null;
    if (id !== null) await tools.ptyClose(id).catch(() => {});
  }

  async function changeShell(next: PtyShell) {
    shell = next;
    try {
      localStorage.setItem(SHELL_KEY, next);
    } catch {
      /* ignore */
    }
    await stop();
    await start();
  }

  onMount(async () => {
    term = new Terminal({
      fontFamily: "'Lucida Console', 'Courier New', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: theme(),
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    term.attachCustomKeyEventHandler((event) => {
      // Let the app handle its own shortcut (Ctrl+`), and copy on Ctrl+C only when text is selected.
      if (event.ctrlKey && event.key === '`') return false;
      if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c' && term.hasSelection()) {
        void navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
        return false;
      }
      return true;
    });
    term.onData((data) => {
      typedAt = Date.now();
      if (sessionId !== null) void tools.ptyWrite(sessionId, data).catch(() => {});
    });
    term.onResize(({ cols, rows }) => {
      if (sessionId !== null) void tools.ptyResize(sessionId, cols, rows).catch(() => {});
    });

    unlisten = await Promise.all([
      tools.onPtyOutput((id, data) => {
        if (id !== sessionId) return;
        term.write(data);
        scheduleRefresh();
      }),
      tools.onPtyExit((id) => {
        if (id !== sessionId) return;
        sessionId = null;
        ended = true;
        term.write('\r\n\x1b[90m[processo finalizado]\x1b[0m\r\n');
      }),
    ]);

    observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* host hidden or zero-sized */
      }
    });
    observer.observe(host);
    await start();
  });

  onDestroy(() => {
    clearTimeout(idleTimer);
    observer?.disconnect();
    unlisten.forEach((off) => off());
    void stop();
    term?.dispose();
  });
</script>

<section class="terminal pty">
  <div class="terminal-head">
    <span><Icon name="terminal" size={13} />Terminal <small>{cwd}</small></span>
    <div class="terminal-quick">
      <select aria-label="Tipo de terminal" value={shell} on:change={(e) => void changeShell(e.currentTarget.value as PtyShell)}>
        {#each PTY_SHELLS as item}<option value={item.id}>{item.label}</option>{/each}
      </select>
      {#if ended}<button on:click={() => void start()}>Reiniciar</button>{/if}
      <button class="icon-button" aria-label="Fechar terminal" title="Fechar · Ctrl `" on:click={onClose}
        ><Icon name="close" size={13} /></button
      >
    </div>
  </div>
  {#if error}<p class="aic-error" role="alert">{error}</p>{/if}
  <div class="pty-host" bind:this={host} aria-label="Terminal interativo"></div>
</section>
