<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { gateway } from '../infrastructure/gateway';
  import { PROVIDERS, getProvider } from '../domain/providers';
  import type {
    ChatMessage,
    DocumentTab,
    FileEntry,
    ProviderId,
    Workspace,
  } from '../domain/models';
  import { createDocumentTab, isDocumentDirty, markDocumentSaved } from '../domain/documents';
  import Brain from './Brain.svelte';
  import Icon from './Icon.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import SourceControl from './SourceControl.svelte';
  import TerminalPanel from './TerminalPanel.svelte';
  import { gitAct, gitBusy, gitHooks, gitMessage, gitState, refreshGit } from './git-store';
  import { canFormat, formatCode } from '../application/formatter';
  import AiCenter from './AiCenter.svelte';
  import AiMonitor from './AiMonitor.svelte';
  import {
    loadStatuses,
    pending as aiPending,
    providerStatus,
    selectedProvider,
    track,
    type ActivityKind,
  } from './ai-store';
  import RunPanel from './RunPanel.svelte';
  import PreviewPane from './PreviewPane.svelte';
  import { tools as workspaceTools } from '../infrastructure/workspace-tools';

  let workspace: Workspace | null = null;
  let tabs: DocumentTab[] = [];
  let activePath = '';
  let activeTab: DocumentTab | undefined;
  let showHome = true;
  let directories: Record<string, FileEntry[]> = {};
  let expanded: Record<string, boolean> = {};
  let settingProvider: ProviderId = 'minhavida';
  $: configured = Object.fromEntries(
    Object.entries($providerStatus).map(([key, value]) => [key, value.configured]),
  ) as Partial<Record<ProviderId, boolean>>;
  $: pending = $aiPending;
  let apiKey = '';
  let configBusy = false;
  let working = false;
  let saving = false;
  let dialog: 'settings' | 'commands' | 'roadmap' | 'discard' | 'git' | 'run' | null = null;
  let repoBusy = false;
  let previewUrl = '';
  let showPreview = false;
  let previewRevision = 0;

  // Layout: draggable panels, remembered per computer.
  function stored(key: string, fallback: number) {
    try {
      const value = Number(localStorage.getItem(`cmb.${key}`));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
      return fallback;
    }
  }
  function remember(key: string, value: number | boolean) {
    try {
      localStorage.setItem(`cmb.${key}`, String(value));
    } catch {
      /* storage unavailable */
    }
  }
  let sidebarWidth = stored('sidebar', 260);
  let chatWidth = stored('chat', 340);
  let terminalHeight = stored('terminal', 220);
  let sidebarView: 'files' | 'git' = 'files';
  let showTerminal = false;
  let terminal: TerminalPanel;
  let formatOnSave = (() => {
    try {
      return localStorage.getItem('cmb.formatOnSave') !== 'false';
    } catch {
      return true;
    }
  })();
  let formatting = false;
  let liveRunning = false;
  let liveUrl = '';
  let liveBusy = false;
  let retro = (() => {
    try {
      return localStorage.getItem('cmb.retro') === 'true';
    } catch {
      return false;
    }
  })();
  function toggleRetro() {
    retro = !retro;
    remember('retro', retro);
  }
  function relativeToWorkspace(path: string): string {
    if (!workspace) return '';
    return path
      .slice(workspace.path.length)
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/');
  }
  async function syncLive() {
    if (gateway.isPreview || !workspace) return;
    try {
      const state = await workspaceTools.state();
      liveRunning = state.running && state.label === 'Live Server';
      if (!liveRunning) liveUrl = '';
    } catch {
      liveRunning = false;
    }
  }
  /** One click: serve the open .html (or index.html) with auto reload on every save. */
  async function toggleLive() {
    if (!workspace || liveBusy) return;
    liveBusy = true;
    try {
      if (liveRunning) {
        await workspaceTools.stop();
        liveRunning = false;
        liveUrl = '';
        showPreview = false;
        record('Live Server parado.', 'run');
        return;
      }
      const html =
        activeTab && /\.html?$/i.test(activeTab.name) ? relativeToWorkspace(activeTab.path) : undefined;
      const state = await workspaceTools.start('static', html);
      liveRunning = true;
      liveUrl = state.url ?? '';
      if (liveUrl) {
        previewUrl = liveUrl;
        showPreview = true;
      }
      record(`Live Server no ar: ${liveUrl}`, 'run');
    } catch (error) {
      failure(error);
    } finally {
      liveBusy = false;
    }
  }

  function startResize(event: PointerEvent, panel: 'sidebar' | 'chat' | 'terminal') {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial =
      panel === 'sidebar' ? sidebarWidth : panel === 'chat' ? chatWidth : terminalHeight;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add(panel === 'terminal' ? 'resizing-row' : 'resizing');
    const move = (e: PointerEvent) => {
      if (panel === 'sidebar') sidebarWidth = clamp(initial + e.clientX - startX, 160, 560);
      else if (panel === 'chat') chatWidth = clamp(initial - (e.clientX - startX), 260, 720);
      else terminalHeight = clamp(initial - (e.clientY - startY), 90, window.innerHeight - 260);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing', 'resizing-row');
      remember('sidebar', sidebarWidth);
      remember('chat', chatWidth);
      remember('terminal', terminalHeight);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
  function collapseAll() {
    expanded = {};
  }
  async function toggleTerminal(force?: boolean) {
    if (!workspace && !showTerminal) {
      notify('Abra uma pasta de projeto primeiro.');
      return;
    }
    showTerminal = force ?? !showTerminal;
    if (showTerminal) {
      await tick();
      terminal?.focus();
    }
  }
  function showGit() {
    if (!workspace) {
      notify('Abra uma pasta de projeto primeiro.');
      return;
    }
    showSidebar = true;
    sidebarView = 'git';
    void refreshGit();
  }
  async function reloadTree() {
    if (!workspace) return;
    const epoch = workspaceEpoch;
    try {
      const entries = await gateway.listDirectory(workspace.path);
      const opened = Object.keys(expanded).filter((path) => expanded[path]);
      const children = await Promise.all(
        opened.map((path) => gateway.listDirectory(path).catch(() => null)),
      );
      if (epoch !== workspaceEpoch || !workspace) return;
      workspace = { ...workspace, entries };
      const nextDirs = { ...directories };
      const nextExpanded = { ...expanded };
      opened.forEach((path, i) => {
        if (children[i]) nextDirs[path] = children[i]!;
        else delete nextExpanded[path];
      });
      directories = nextDirs;
      expanded = nextExpanded;
    } catch {
      /* folder may have been removed by a command */
    }
  }
  async function formatActive(silent = false): Promise<boolean> {
    const tab = activeTab;
    if (!tab || formatting) return false;
    if (!canFormat(tab.path, tab.language)) {
      if (!silent) notify(`Sem formatador embutido para ${tab.language}.`);
      return false;
    }
    formatting = true;
    try {
      const formatted = await formatCode(tab.content, tab.path, tab.language);
      if (formatted !== null && formatted !== tab.content) updateContent(tab.path, formatted);
      if (!silent) notify('Código formatado.');
      return true;
    } catch (error) {
      if (!silent) {
        const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
        notify(`Não deu pra formatar: ${detail}`);
      }
      return false;
    } finally {
      formatting = false;
    }
  }
  $: gitChanges = $gitState?.changes.length ?? 0;

  async function refreshWorktree() {
    if (!workspace) return;
    const entries = await gateway.listDirectory(workspace.path);
    workspaceEpoch += 1;
    workspace = { ...workspace, entries };
    tabs = [];
    activePath = '';
    showHome = true;
    expanded = {};
    directories = {};
    previewRevision += 1;
    void refreshGit(true);
  }
  function openTool(tool: 'git' | 'run') {
    if (!workspace) {
      notify('Abra uma pasta de projeto primeiro.');
      return;
    }
    if (tool === 'git') showGit();
    else dialog = tool;
  }
  let afterDiscard: (() => void) | null = null;
  let fileFilter = '';
  let searchInput: HTMLInputElement;
  let keyInput: HTMLInputElement;
  let codeEditor: CodeEditor;
  let notification = '';
  let notificationTimer: ReturnType<typeof setTimeout>;
  let showJournal = false;
  let showChat = true;
  let showSidebar = true;
  let line = 1;
  let column = 1;
  let logs: { time: string; message: string }[] = [];
  let visibleEntries: { entry: FileEntry; depth: number }[] = [];
  let workspaceEpoch = 0;

  async function windowAction(action: 'close' | 'minimize' | 'maximize') {
    if (gateway.isPreview) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const window = getCurrentWindow();
      if (action === 'close') await window.close();
      else if (action === 'minimize') await window.minimize();
      else await window.toggleMaximize();
    } catch (error) {
      failure(error);
    }
  }

  $: activeTab = tabs.find((tab) => tab.path === activePath);
  $: visibleEntries = flatten(workspace?.entries ?? [], 0, expanded, directories, fileFilter);

  function flatten(
    entries: FileEntry[],
    depth: number,
    opened: Record<string, boolean>,
    childrenByPath: Record<string, FileEntry[]>,
    filter: string,
  ): { entry: FileEntry; depth: number }[] {
    return entries.flatMap((entry) => {
      const children =
        entry.isDirectory && opened[entry.path]
          ? flatten(childrenByPath[entry.path] ?? [], depth + 1, opened, childrenByPath, filter)
          : [];
      const row = !filter || entry.name.toLowerCase().includes(filter.toLowerCase());
      return [...(row ? [{ entry, depth }] : []), ...children];
    });
  }

  function record(message: string, kind: ActivityKind = 'system') {
    if (kind !== 'system' || message.includes('credencial')) track(kind, message);
    logs = [...logs.slice(-49), { time: new Date().toLocaleTimeString('pt-BR'), message }];
  }
  function notify(message: string) {
    notification = message;
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => {
      notification = '';
    }, 6000);
  }
  function failure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    notify(message);
    record(message);
  }
  function protectChanges(action: () => void) {
    if (tabs.some(isDocumentDirty)) {
      afterDiscard = action;
      dialog = 'discard';
    } else action();
  }
  function closeDialog() {
    if (repoBusy) return;
    dialog = null;
    apiKey = '';
    afterDiscard = null;
  }
  async function openSettings(id?: ProviderId) {
    settingProvider = id ?? $selectedProvider;
    apiKey = '';
    dialog = 'settings';
    await tick();
    keyInput?.focus();
  }
  async function loadWorkspace() {
    if (working) return;
    working = true;
    try {
      const next = await gateway.openWorkspace();
      workspaceEpoch += 1;
      workspace = next;
      tabs = [];
      activePath = '';
      showHome = true;
      directories = {};
      expanded = {};
      fileFilter = '';
      previewUrl = '';
      showPreview = false;
      gitState.set(null);
      gitMessage.set(null);
      if (!gateway.isPreview) void refreshGit(true);
      record(`Pasta aberta: ${next.name}${gateway.isPreview ? ' (prévia em memória)' : ''}.`);
    } catch (error) {
      failure(error);
    } finally {
      working = false;
    }
  }
  function openWorkspace() {
    if (repoBusy) {
      notify('Aguarde a operação Git terminar antes de trocar de projeto.');
      return;
    }
    if (working) return;
    if (saving) {
      notify('Aguarde o salvamento antes de trocar de pasta.');
      return;
    }
    protectChanges(() => {
      void loadWorkspace();
    });
  }
  async function openEntry(entry: FileEntry) {
    if (working) return;
    const epoch = workspaceEpoch;
    if (entry.isDirectory) {
      if (expanded[entry.path]) expanded = { ...expanded, [entry.path]: false };
      else {
        try {
          const children = await gateway.listDirectory(entry.path);
          if (epoch !== workspaceEpoch || working) return;
          directories = { ...directories, [entry.path]: children };
          expanded = { ...expanded, [entry.path]: true };
        } catch (error) {
          failure(error);
        }
      }
      return;
    }
    const existing = tabs.find((tab) => tab.path === entry.path);
    if (existing) {
      activePath = existing.path;
      showHome = false;
      showPreview = false;
      return;
    }
    try {
      const file = await gateway.readFile(entry.path);
      if (epoch !== workspaceEpoch || working) return;
      // A quick double click must open a single tab.
      if (!tabs.some((tab) => tab.path === file.path)) tabs = [...tabs, createDocumentTab(file)];
      activePath = file.path;
      showHome = false;
      showPreview = false;
      line = 1;
      column = 1;
      record(`Arquivo aberto: ${file.name}.`);
    } catch (error) {
      failure(error);
    }
  }
  async function saveActive() {
    const tab = activeTab;
    if (!tab || saving || working || !isDocumentDirty(tab)) return;
    if (formatOnSave && canFormat(tab.path, tab.language)) {
      await formatActive(true);
      await tick();
    }
    const current = tabs.find((item) => item.path === tab.path) ?? tab;
    saving = true;
    const snapshot = current.content;
    try {
      await gateway.saveFile(tab.path, snapshot, tab.savedContent);
      tabs = tabs.map((item) =>
        item.path === tab.path ? markDocumentSaved(item, snapshot) : item,
      );
      notify(gateway.isPreview ? 'Salvo na memória desta prévia.' : 'Pronto, arquivo salvo.');
      record(`Arquivo salvo: ${tab.name}.`, 'file');
      previewRevision += 1;
      if (!gateway.isPreview) void refreshGit(true);
    } catch (error) {
      failure(error);
    } finally {
      saving = false;
    }
  }
  function insertFromAi(code: string) {
    if (!activeTab) {
      notify('Abra um arquivo para inserir o código.');
      return;
    }
    showHome = false;
    showPreview = false;
    if (codeEditor?.insertText(code)) {
      record(`IA: código inserido em ${activeTab.name}.`, 'ai');
      notify(`Código inserido em ${activeTab.name}. Revise e salve.`);
    }
  }
  function updateContent(path: string, content: string) {
    if (working) return;
    tabs = tabs.map((tab) => (tab.path === path ? { ...tab, content } : tab));
  }
  function closeTab(path: string) {
    const action = () => {
      const index = tabs.findIndex((tab) => tab.path === path);
      tabs = tabs.filter((tab) => tab.path !== path);
      if (activePath === path) activePath = tabs[Math.min(index, tabs.length - 1)]?.path ?? '';
      if (!tabs.length) showHome = true;
    };
    if (tabs.find((tab) => tab.path === path && isDocumentDirty(tab))) {
      afterDiscard = action;
      dialog = 'discard';
    } else action();
  }
  async function configure() {
    if (configBusy) return;
    const id = settingProvider;
    configBusy = true;
    try {
      await gateway.configureProvider(id, apiKey);
      await loadStatuses();
      record(`${getProvider(id).name}: credencial guardada no cofre do sistema.`, 'system');
      notify('Chave guardada. Agora a prosa pode começar.');
      if (dialog === 'settings' && settingProvider === id) closeDialog();
    } catch (error) {
      failure(error);
    } finally {
      configBusy = false;
    }
  }
  async function removeKey() {
    const id = settingProvider;
    configBusy = true;
    try {
      await gateway.removeProvider(id);
      await loadStatuses();
      apiKey = '';
      record(`${getProvider(id).name}: credencial removida do cofre.`, 'system');
      notify('Credencial removida do cofre.');
    } catch (error) {
      failure(error);
    } finally {
      configBusy = false;
    }
  }
  function handleKeys(event: KeyboardEvent) {
    if (event.key === 'Escape' && dialog) {
      closeDialog();
      return;
    }
    if (dialog) return;
    if (event.shiftKey && event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void formatActive();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === '`' || event.code === 'Backquote') {
      event.preventDefault();
      void toggleTerminal();
      return;
    }
    if (event.shiftKey && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      showGit();
      return;
    }
    if (event.key.toLowerCase() === 'b') {
      event.preventDefault();
      showSidebar = !showSidebar;
      return;
    }
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveActive();
    }
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      openWorkspace();
    }
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      dialog = dialog === 'commands' ? null : 'commands';
    }
    if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      searchInput?.focus();
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (tabs.some(isDocumentDirty)) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  function focusModal(node: HTMLDivElement) {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [
      ...node.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ),
    ];
    void tick().then(() => focusable()[0]?.focus());
    function trap(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        node.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    node.addEventListener('keydown', trap);
    return {
      destroy() {
        node.removeEventListener('keydown', trap);
        previous?.focus();
      },
    };
  }
  gitHooks.hasUnsaved = () => tabs.some(isDocumentDirty);
  gitHooks.onWorktreeChanged = refreshWorktree;
  gitHooks.onBusyChange = (busy) => (repoBusy = busy);
  onMount(() => {
    if (!gateway.isPreview)
      workspaceTools
        .currentWorkspace()
        .then((current) => {
          if (current) {
            workspace = current;
            void refreshGit(true);
          }
        })
        .catch(failure);
    // Keep the Git bar honest when files change outside the editor.
    const gitPoll = setInterval(() => {
      if (workspace && !gateway.isPreview && document.hasFocus()) {
        void refreshGit(true);
        void syncLive();
      }
    }, 8000);
    let cleanupClose: (() => void) | undefined;
    let disposed = false;
    if (!gateway.isPreview) {
      import('@tauri-apps/api/window')
        .then(async ({ getCurrentWindow }) => {
          const nativeWindow = getCurrentWindow();
          const unlisten = await nativeWindow.onCloseRequested((event) => {
            if (repoBusy) {
              event.preventDefault();
              notify('Aguarde a operação Git terminar para fechar.');
              return;
            }
            if (tabs.some(isDocumentDirty)) {
              event.preventDefault();
              afterDiscard = () => {
                tabs = [];
                void nativeWindow.close().catch(failure);
              };
              dialog = 'discard';
            }
          });
          if (disposed) unlisten();
          else cleanupClose = unlisten;
        })
        .catch(failure);
    }
    record(
      gateway.isPreview
        ? 'Prévia web iniciada. Arquivos de exemplo ficam apenas em memória.'
        : 'Cérebro ligado. Abra uma pasta para começar.',
    );
    loadStatuses().catch(failure);
    return () => {
      disposed = true;
      clearInterval(gitPoll);
      cleanupClose?.();
      clearTimeout(notificationTimer);
    };
  });
</script>

<svelte:window on:keydown={handleKeys} on:beforeunload={beforeUnload} />

<div class="app-shell" class:retro class:native={!gateway.isPreview}>
  <header class="topbar" data-tauri-drag-region>
    <div class="window-tools">
      <div class="traffic-lights">
        <button
          class="traffic close"
          disabled={gateway.isPreview}
          aria-label="Fechar aplicativo"
          title="Fechar aplicativo"
          on:click={() => windowAction('close')}><span>×</span></button
        ><button
          class="traffic minimize"
          disabled={gateway.isPreview}
          aria-label="Minimizar janela"
          title="Minimizar janela"
          on:click={() => windowAction('minimize')}><span>−</span></button
        ><button
          class="traffic maximize"
          disabled={gateway.isPreview}
          aria-label="Ampliar janela"
          title="Ampliar janela"
          on:click={() => windowAction('maximize')}><span>+</span></button
        >
      </div>
      <button
        class="icon-button sidebar-toggle"
        aria-label="Alternar barra lateral"
        title="Alternar barra lateral"
        on:click={() => (showSidebar = !showSidebar)}><Icon name="book" size={18} /></button
      >
    </div>
    <button class="toolbar-project" on:click={openWorkspace} disabled={working}
      ><Icon name="folder" size={16} /><strong>{workspace?.name ?? 'Coder mega-brain'}</strong><Icon
        name="down"
        size={11}
      /></button
    >
    {#if workspace && !gateway.isPreview}
      <div class="git-strip" class:busy={$gitBusy}>
        {#if $gitState?.repository}
          <button class="git-chip" on:click={showGit} title="Controle de versão · Ctrl Shift G"
            ><Icon name="branch" size={14} /><span>{$gitState.branch}</span>{#if gitChanges}<b
                class="git-count">{gitChanges}</b
              >{/if}{#if $gitState.ahead}<small title="Commits para enviar">↑{$gitState.ahead}</small
              >{/if}{#if $gitState.behind}<small title="Commits para puxar">↓{$gitState.behind}</small
              >{/if}</button
          ><button
            class="git-act"
            title={$gitState.remote ? 'Pull · puxar do GitHub' : 'Vincule o GitHub no painel Git'}
            disabled={$gitBusy || !$gitState.remote}
            on:click={() => gitAct('pull')}>↓ Pull</button
          ><button
            class="git-act"
            title={$gitState.remote ? 'Push · enviar para o GitHub' : 'Vincule o GitHub no painel Git'}
            disabled={$gitBusy || !$gitState.remote}
            on:click={() => gitAct('push')}>↑ Push</button
          ><button
            class="git-act"
            title="Sincronizar: pull e depois push"
            disabled={$gitBusy || !$gitState.remote}
            on:click={() => gitAct('sync')}><Icon name="refresh" size={13} /></button
          >
        {:else if $gitState && $gitState.available}
          <button class="git-chip" on:click={showGit}
            ><Icon name="branch" size={14} /><span>Sem Git · iniciar</span></button
          >
        {:else}
          <button class="git-chip" on:click={showGit}><Icon name="branch" size={14} /><span>Git</span></button>
        {/if}
        <button
          class="git-act live"
          class:active={liveRunning}
          disabled={liveBusy}
          title={liveRunning
            ? `Live Server em ${liveUrl} · clique para parar`
            : 'Live Server: abre o HTML aberto (ou index.html) e recarrega ao salvar'}
          on:click={toggleLive}
          ><span class="live-led"></span>{liveRunning ? 'Ao vivo' : 'Live Server'}</button
        ><button
          class="git-act"
          class:active={showTerminal}
          title="Terminal · Ctrl `"
          on:click={() => toggleTerminal()}><Icon name="terminal" size={13} />Terminal</button
        >
      </div>
    {/if}
    <div class="topbar-actions">
      <button
        class="icon-button"
        title="Controle de versão"
        aria-label="Controle de versão"
        on:click={() => openTool('git')}><Icon name="branch" size={18} /></button
      >
      <button
        class="icon-button"
        title="Executar projeto"
        aria-label="Executar projeto"
        on:click={() => openTool('run')}><Icon name="terminal" size={18} /></button
      >
      <button
        class="icon-button"
        on:click={() => (dialog = 'commands')}
        title="Comandos · Ctrl K"
        aria-label="Comandos"><Icon name="search" size={18} /></button
      ><button
        class="icon-button"
        title="Configurações de IA"
        aria-label="Configurações de IA"
        on:click={() => openSettings()}><Icon name="settings" size={18} /></button
      ><button
        class="icon-button"
        title="Monitor de IA"
        aria-label="Alternar monitor de IA"
        on:click={() => (showChat = !showChat)}><Icon name="chat" size={18} /></button
      >
    </div>
  </header>

  <div
    class="workbench"
    class:chat-hidden={!showChat}
    class:sidebar-hidden={!showSidebar}
    style:--sidebar-w={`${sidebarWidth}px`}
    style:--chat-w={`${chatWidth}px`}
  >
    <aside class="explorer">
      <div class="panel-heading sidebar-heading">
        <div class="sidebar-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={sidebarView === 'files'}
            class:on={sidebarView === 'files'}
            on:click={() => (sidebarView = 'files')}>Arquivos</button
          ><button
            role="tab"
            aria-selected={sidebarView === 'git'}
            class:on={sidebarView === 'git'}
            on:click={showGit}
            >Git{#if gitChanges}<b class="git-count">{gitChanges}</b>{/if}</button
          >
        </div>
        <div class="sidebar-actions">
          {#if sidebarView === 'files'}<button
              class="icon-button"
              aria-label="Recarregar arquivos"
              title="Recarregar arquivos"
              disabled={!workspace}
              on:click={reloadTree}><Icon name="refresh" size={14} /></button
            ><button
              class="icon-button"
              aria-label="Recolher pastas"
              title="Recolher todas as pastas"
              disabled={!Object.values(expanded).some(Boolean)}
              on:click={collapseAll}><Icon name="down" size={14} /></button
            >{:else}<button
              class="icon-button"
              aria-label="Atualizar Git"
              title="Atualizar Git"
              disabled={$gitBusy}
              on:click={() => refreshGit()}><Icon name="refresh" size={14} /></button
            >{/if}<button
            class="icon-button"
            aria-label="Abrir pasta"
            title="Abrir pasta · Ctrl O"
            on:click={openWorkspace}
            disabled={working}><Icon name="folder" size={14} /></button
          ><button
            class="icon-button"
            aria-label="Esconder barra lateral"
            title="Esconder barra lateral · Ctrl B"
            on:click={() => (showSidebar = false)}><Icon name="close" size={14} /></button
          >
        </div>
      </div>
      {#if sidebarView === 'git' && workspace}
        <SourceControl isPreview={gateway.isPreview} onOpenTerminal={() => toggleTerminal(true)} />
      {:else}
      <div class="file-search">
        <Icon name="search" size={14} /><input
          aria-label="Filtrar arquivos carregados"
          placeholder="Encontrar arquivo..."
          bind:value={fileFilter}
          bind:this={searchInput}
        /><kbd>⌃P</kbd>
      </div>
      {#if workspace}
        <div class="folder-root">
          <Icon name="folder" size={13} /><span>{workspace.name}</span><span class="local-label"
            >LOCAL</span
          >
        </div>
        <div class="file-tree">
          {#each visibleEntries as { entry, depth } (entry.path)}
            <button
              class="tree-entry"
              class:selected={activePath === entry.path && !showHome}
              style:padding-left={`${16 + depth * 13}px`}
              on:click={() => openEntry(entry)}
              title={entry.name}
            >
              {#if entry.isDirectory}<Icon
                  name={expanded[entry.path] ? 'down' : 'chevron'}
                  size={11}
                /><Icon name="folder" size={15} />{:else}<span
                  class="file-kind"
                  class:ts={entry.name.endsWith('.ts')}
                  class:md={entry.name.endsWith('.md')}
                  >{entry.name.endsWith('.ts')
                    ? 'TS'
                    : entry.name.endsWith('.md')
                      ? 'M↓'
                      : entry.name.endsWith('.json')
                        ? '{}'
                        : '≡'}</span
                >{/if}<span>{entry.name}</span
              >{#if tabs.some((t) => t.path === entry.path && isDocumentDirty(t))}<span
                  class="dirty-dot"
                ></span>{/if}
            </button>
          {/each}
          {#if !visibleEntries.length}<p class="tree-empty">
              {fileFilter
                ? 'Nenhum arquivo carregado corresponde.'
                : 'Pasta vazia ou sem arquivos visíveis.'}
            </p>{/if}
        </div>
      {:else}
        <div class="explorer-empty">
          <span class="empty-folder"><Icon name="folder" size={28} /></span><strong
            >Seu próximo projeto</strong
          >
          <p>Um lugar para suas ideias.<br />Comece abrindo uma pasta.</p>
          <button class="secondary-button" on:click={openWorkspace} disabled={working}
            ><Icon name="plus" size={15} />{working
              ? 'Abrindo...'
              : gateway.isPreview
                ? 'Explorar exemplo'
                : 'Abrir uma pasta'}</button
          ><span class="shortcut-note">Ctrl + O</span>
        </div>
      {/if}
      {/if}
    </aside>
    {#if showSidebar}<div
        class="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar barra lateral"
        title="Arraste para redimensionar · duplo clique restaura"
        on:pointerdown={(e) => startResize(e, 'sidebar')}
        on:dblclick={() => {
          sidebarWidth = 260;
          remember('sidebar', 260);
        }}
      ></div>{/if}

    <main class="main-area">
      <div class="tab-bar">
        <div class="tabs">
          <button
            class="editor-tab home-tab"
            class:chosen={showHome}
            on:click={() => {
              showHome = true;
              showPreview = false;
            }}><Icon name="spark" size={14} />Central IA</button
          >{#each tabs as tab (tab.path)}<div
              class="tab-wrapper"
              class:chosen={!showHome && activePath === tab.path}
            >
              <button
                class="editor-tab"
                on:click={() => {
                  activePath = tab.path;
                  showHome = false;
                  showPreview = false;
                }}
                ><Icon name="code" size={14} />{tab.name}{#if isDocumentDirty(tab)}<span
                    class="dirty-dot"
                  ></span>{/if}</button
              ><button
                class="tab-close"
                on:click={() => closeTab(tab.path)}
                aria-label={`Fechar ${tab.name}`}><Icon name="close" size={12} /></button
              >
            </div>{/each}
        </div>
        {#if activeTab && !showHome}<button
            class="format-button"
            class:off={!canFormat(activeTab.path, activeTab.language)}
            on:click={() => formatActive()}
            disabled={formatting}
            title="Formatar código · Shift Alt F">{formatting ? '...' : '{ } Formatar'}</button
          ><label class="format-toggle" title="Formatar automaticamente ao salvar"
            ><input
              type="checkbox"
              bind:checked={formatOnSave}
              on:change={() => remember('formatOnSave', formatOnSave)}
            />ao salvar</label
          ><button
            class="icon-button save-button"
            on:click={saveActive}
            disabled={saving || !isDocumentDirty(activeTab)}
            aria-label="Salvar arquivo"
            title="Salvar · Ctrl S"><Icon name="save" size={16} /></button
          >{/if}
      </div>

      <div class="editor-surface">
        {#if showPreview && previewUrl}<PreviewPane
            url={previewUrl}
            revision={previewRevision}
            onClose={() => (showPreview = false)}
          />
        {:else if showHome || !activeTab}
          <AiCenter
            isPreview={gateway.isPreview}
            hasWorkspace={!!workspace}
            activeFile={activeTab
              ? {
                  path: activeTab.path,
                  name: activeTab.name,
                  language: activeTab.language,
                  content: activeTab.content,
                }
              : null}
            onConfigure={(id) => openSettings(id)}
            onOpenWorkspace={openWorkspace}
            onInsertCode={activeTab ? insertFromAi : null}
          />
        {:else}
          <div class="breadcrumb">
            <Icon name="folder" size={13} /><span>{workspace?.name}</span><Icon
              name="chevron"
              size={11}
            /><span>{activeTab.name}</span><span class="breadcrumb-state"
              >{isDocumentDirty(activeTab) ? 'alterações não salvas' : 'salvo'}</span
            >
          </div>
        {/if}
        {#if tabs.length}<div
            class="editor-mount"
            class:editor-hidden={showHome || !activeTab || showPreview}
          >
            <CodeEditor
              bind:this={codeEditor}
              {retro}
              path={activeTab?.path ?? ''}
              value={activeTab?.content ?? ''}
              language={activeTab?.language ?? 'plaintext'}
              openPaths={tabs.map((tab) => tab.path)}
              readOnly={working || repoBusy}
              visible={!showHome && !showPreview}
              onChange={updateContent}
              onPosition={(l, c) => {
                line = l;
                column = c;
              }}
            />
          </div>{/if}
      </div>
      {#if showJournal}<section class="journal">
          <div class="panel-heading">
            <h2>Atividade <span>{logs.length}</span></h2>
            <button
              class="icon-button"
              aria-label="Fechar diário"
              on:click={() => (showJournal = false)}><Icon name="close" size={14} /></button
            >
          </div>
          <div class="journal-content">
            {#each logs as log}<div><time>{log.time}</time><span>{log.message}</span></div>{/each}
          </div>
        </section>{/if}
      {#if showTerminal}
        <div
          class="resizer-row"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Redimensionar terminal"
          on:pointerdown={(e) => startResize(e, 'terminal')}
        ></div>
        <div class="terminal-wrap" style:height={`${terminalHeight}px`}>
          <TerminalPanel
            bind:this={terminal}
            isPreview={gateway.isPreview}
            cwd={workspace?.name ?? ''}
            onClose={() => (showTerminal = false)}
            onFilesChanged={reloadTree}
          />
        </div>
      {/if}
      <div class="editor-bottom">
        <button on:click={() => openTool('git')}
          ><Icon name="branch" size={13} />{$gitState?.repository ? $gitState.branch : 'Git'}</button
        >
        <button class:journal-open={showTerminal} on:click={() => toggleTerminal()}
          ><Icon name="terminal" size={13} />Terminal</button
        >
        <button on:click={() => openTool('run')}><Icon name="monitor" size={13} />Executar</button>
        {#if previewUrl}<button on:click={() => (showPreview = !showPreview)}
            ><Icon name="monitor" size={13} />Prévia</button
          >{/if}
        <button class:journal-open={showJournal} on:click={() => (showJournal = !showJournal)}
          ><Icon name="terminal" size={13} />Atividade</button
        ><span
          >{gateway.isPreview ? 'Sessão temporária em memória' : 'Arquivos locais · UTF-8'}</span
        ><span class="editor-bottom-right"
          >{showHome ? 'Pode chegar, a casa é sua.' : `Ln ${line}, Col ${column}`}</span
        >
      </div>
    </main>

    {#if showChat}<div
        class="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painel de IA"
        title="Arraste para redimensionar · duplo clique restaura"
        on:pointerdown={(e) => startResize(e, 'chat')}
        on:dblclick={() => {
          chatWidth = 340;
          remember('chat', 340);
        }}
      ></div><AiMonitor />{/if}
  </div>

  <footer class="statusbar">
    <div>
      <button class="visual-toggle" on:click={toggleRetro} title="Alternar visual"
        >{retro ? '▮ terminal' : '◐ moderno'}</button
      ><span class="status-divider"></span>
      <Brain size={15} /><span>Coder mega-brain</span><span class="status-divider"></span><span
        class="live-dot"
      ></span><span>{gateway.isPreview ? 'Prévia web' : 'Desktop local'}</span>
    </div>
    <div>
      <span>{tabs.length} {tabs.length === 1 ? 'arquivo aberto' : 'arquivos abertos'}</span><span
        class="status-divider"
      ></span><span>{PROVIDERS.filter((p) => configured[p.id]).length} de {PROVIDERS.filter((p) => p.supported)
          .length} IAs conectadas</span
      ><Icon name="coffee" size={13} />
    </div>
  </footer>
</div>

{#if notification}<div class="toast" role="status">
    <Icon name="terminal" size={16} /><span>{notification}</span><button
      class="icon-button"
      aria-label="Fechar aviso"
      on:click={() => (notification = '')}><Icon name="close" size={14} /></button
    >
  </div>{/if}

{#if dialog}
  <div class="modal-layer">
    <button class="modal-backdrop" aria-label="Fechar janela" on:click={closeDialog}></button>
    <div
      class="modal"
      use:focusModal
      role="dialog"
      aria-modal="true"
      aria-label={dialog === 'settings'
        ? 'Configurações de IA'
        : dialog === 'commands'
          ? 'Comandos'
          : dialog === 'discard'
            ? 'Alterações não salvas'
            : dialog === 'git'
              ? 'Controle de versão'
              : dialog === 'run'
                ? 'Executar projeto'
                : 'Plano do projeto'}
      tabindex="-1"
    >
      <div class="modal-heading">
        <span class="small-label"
          >{dialog === 'settings'
            ? 'AS CHAVES DA CASA'
            : dialog === 'commands'
              ? 'NA PONTA DOS DEDOS'
              : dialog === 'discard'
                ? 'OPA, TEM COISA NA MESA'
                : dialog === 'git'
                  ? 'CONTROLE DE VERSÃO'
                  : dialog === 'run'
                    ? 'EXECUTAR PROJETO'
                    : 'A OFICINA TÁ CRESCENDO'}</span
        ><button class="icon-button" aria-label="Fechar janela" on:click={closeDialog}
          ><Icon name="close" /></button
        >
      </div>
      {#if dialog === 'run'}<RunPanel
          isPreview={gateway.isPreview}
          onPreview={(url) => {
            previewUrl = url;
            showPreview = true;
            dialog = null;
          }}
        />
      {:else if dialog === 'settings'}<h2>Conecte seus cérebros.</h2>
        <p class="modal-description">Cada provedor tem sua chave e sua conversa.</p>
        <div class="settings-providers">
          {#each PROVIDERS as item}<button
              class:chosen={settingProvider === item.id}
              on:click={() => {
                settingProvider = item.id;
                apiKey = '';
              }}
              disabled={configBusy}
              >{item.name}{#if configured[item.id]}<span class="live-dot"></span>{/if}</button
            >{/each}
        </div>
        <div class="provider-info">
          <strong>{getProvider(settingProvider).name}</strong>
          <p>{getProvider(settingProvider).configurationHint}</p>
        </div>
        {#if gateway.isPreview}<div class="info-box">
            <Icon name="monitor" size={18} />
            <p>
              Esta é a prévia no navegador. Abra o aplicativo desktop para guardar chaves com
              segurança e conversar com as APIs.
            </p>
          </div>{/if}{#if getProvider(settingProvider).supported}<form
            on:submit|preventDefault={configure}
          >
            <label class="field-label" for="api-key"
              >Chave da API {configured[settingProvider]
                ? `(atual ${$providerStatus[settingProvider]?.hint ?? ''} · colar outra substitui)`
                : ''}</label
            ><input
              id="api-key"
              bind:this={keyInput}
              bind:value={apiKey}
              class="text-field"
              type="password"
              autocomplete="off"
              spellcheck="false"
              placeholder="Cole sua chave aqui"
              disabled={gateway.isPreview || configBusy}
            />
            <p class="field-note">
              <Icon name="lock" size={12} />Guardada no cofre do sistema. Nunca no projeto.
            </p>
            <div class="modal-actions">
              {#if configured[settingProvider]}<button
                  class="text-button"
                  type="button"
                  on:click={removeKey}
                  disabled={configBusy || pending[settingProvider]}>Remover chave</button
                >{/if}<button
                class="primary-button"
                type="submit"
                disabled={gateway.isPreview ||
                  !apiKey.trim() ||
                  configBusy ||
                  pending[settingProvider]}
                ><Icon name="key" size={15} />{configBusy
                  ? 'Guardando...'
                  : 'Guardar chave'}</button
              >
            </div>
          </form>{:else}<div class="info-box">
            <Icon name="box" size={18} />
            <p>
              O chat estará disponível quando o SDK e a autenticação oficiais estiverem integrados e
              testados.
            </p>
          </div>{/if}
      {:else if dialog === 'commands'}<h2>Seu próximo comando.</h2>
        <p class="modal-description">Um atalho pra deixar a ideia correr.</p>
        <div class="command-list">
          <button
            on:click={() => {
              closeDialog();
              openWorkspace();
            }}><Icon name="folder" /><span>Abrir uma pasta</span><kbd>Ctrl O</kbd></button
          ><button
            on:click={() => {
              closeDialog();
              void saveActive();
            }}
            disabled={!activeTab || !isDocumentDirty(activeTab)}
            ><Icon name="save" /><span>Salvar arquivo atual</span><kbd>Ctrl S</kbd></button
          ><button
            on:click={() => {
              closeDialog();
              searchInput?.focus();
            }}
            ><Icon name="search" /><span>Filtrar arquivos carregados</span><kbd>Ctrl P</kbd></button
          ><button on:click={() => openSettings()}
            ><Icon name="key" /><span>Configurar provedores de IA</span></button
          ><button
            on:click={() => {
              closeDialog();
              showJournal = !showJournal;
            }}><Icon name="terminal" /><span>Alternar diário do cérebro</span></button
          ><button
            on:click={() => {
              closeDialog();
              showHome = true;
            }}><Icon name="spark" /><span>Voltar pro começo de prosa</span></button
          >
        </div>
      {:else if dialog === 'discard'}<h2>Tem alteração sem salvar.</h2>
        <p class="modal-description">
          Salve os arquivos antes de continuar ou descarte as alterações para seguir.
        </p>
        <div class="modal-actions">
          <button class="secondary-button" on:click={closeDialog}>Voltar e salvar</button><button
            class="danger-button"
            on:click={() => {
              const action = afterDiscard;
              closeDialog();
              action?.();
            }}>Descartar e continuar</button
          >
        </div>
      {:else}<h2>Um Fusca cheio de ideia.</h2>
        <p class="modal-description">Uma base própria para o seu editor do dia a dia.</p>
        <div class="roadmap-row">
          <span class="roadmap-number">01</span>
          <div>
            <strong>O editor ganha vida</strong>
            <p>Monaco, pastas locais, abas, salvamento e chats por API.</p>
          </div>
          <span class="roadmap-badge">AGORA</span>
        </div>
        <div class="roadmap-row">
          <span class="roadmap-number">02</span>
          <div>
            <strong>Sua bancada de trabalho</strong>
            <p>Git, scripts npm, servidor HTML e prévia local.</p>
          </div>
          <span class="roadmap-badge">DISPONÍVEL</span>
        </div>
        <div class="roadmap-row">
          <span class="roadmap-number">03</span>
          <div>
            <strong>Próximas ferramentas</strong>
            <p>Docker, terminal interativo, Copilot SDK e agentes com ações revisáveis.</p>
          </div>
          <span class="roadmap-badge">DISPONÍVEL</span>
        </div>
        <div class="info-box">
          <Brain size={23} />
          <p>
            Tauri + Svelte + Rust. Arquitetura DDD, versão 0.2.0. Os chats OpenAI e Anthropic usam
            APIs e ainda não executam agentes.
          </p>
        </div>{/if}
    </div>
  </div>
{/if}
