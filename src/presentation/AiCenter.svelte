<script lang="ts">
  import { tick } from 'svelte';
  import { PROVIDERS, getProvider } from '../domain/providers';
  import type { ProviderId } from '../domain/models';
  import { groupByCompany } from '../domain/workspace-tools';
  import { formatTokens, formatUsd, roughTokens, segments } from '../domain/ai-metrics';
  import {
    catalog,
    catalogState,
    chatErrors,
    clearConversation,
    conversations,
    freeModels,
    loadCatalog,
    models,
    overBudget,
    pending,
    providerStatus,
    selectedProvider,
    send,
    type Attachment,
  } from './ai-store';
  import Brain from './Brain.svelte';
  import Icon from './Icon.svelte';

  export let isPreview = false;
  export let hasWorkspace = false;
  export let activeFile: Attachment | null = null;
  export let onConfigure: (id: ProviderId) => void;
  export let onOpenWorkspace: () => void;
  export let onInsertCode: ((code: string) => void) | null = null;

  let draft = '';
  let attach = false;
  let scroller: HTMLDivElement;
  let input: HTMLTextAreaElement;
  let copied = '';
  let elapsed = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  $: id = $selectedProvider;
  $: provider = getProvider(id);
  $: status = $providerStatus[id];
  $: messages = $conversations[id];
  $: busy = !!$pending[id];
  $: if (id) void loadCatalog();
  $: freeGroups = groupByCompany($freeModels);
  $: companyPrefix = id === 'openai' ? 'openai/' : id === 'anthropic' ? 'anthropic/' : '';
  $: suggestions =
    id === 'openrouter'
      ? $catalog.filter((m) => !m.free).slice(0, 400)
      : companyPrefix
        ? $catalog.filter((m) => m.id.startsWith(companyPrefix) && !m.free)
        : [];
  $: currentPrice = (() => {
    if (id === 'minhavida') return 'grátis';
    const model = $models[id];
    const hit = $catalog.find(
      (m) => m.id === model || m.id === `${companyPrefix}${model}` ||
        m.id === `${companyPrefix}${model.replace(/-(\d+)-(\d+)(?=$|-)/, '-$1.$2')}`,
    );
    return hit
      ? `US$ ${hit.inputPerMillion.toFixed(2)} entrada · ${hit.outputPerMillion.toFixed(2)} saída / 1M`
      : 'preço desconhecido';
  })();
  $: freeProviders = PROVIDERS.filter((item) => item.id === 'minhavida' || item.id === 'openrouter');
  $: paidProviders = PROVIDERS.filter((item) => !freeProviders.some((free) => free.id === item.id));
  $: conversationCost = messages.reduce((sum, m) => sum + (m.meta?.costUsd ?? 0), 0);
  $: conversationTokens = messages.reduce(
    (sum, m) => sum + (m.meta ? m.meta.inputTokens + m.meta.outputTokens : 0),
    0,
  );
  $: contextTokens =
    roughTokens(messages.map((m) => m.content).join('')) +
    roughTokens(draft) +
    (attach && activeFile ? roughTokens(activeFile.content) : 0);
  $: if (busy && !timer) {
    elapsed = 0;
    timer = setInterval(() => (elapsed += 1), 1000);
  } else if (!busy && timer) {
    clearInterval(timer);
    timer = undefined;
  }

  async function submit(text = draft) {
    if (!text.trim() || busy) return;
    const file = attach && activeFile ? activeFile : undefined;
    draft = '';
    await scrollDown();
    try {
      await send(text, file);
    } catch {
      draft = text;
    }
    await scrollDown();
    input?.focus();
  }
  async function scrollDown() {
    await tick();
    // Scrolling is cosmetic: it must never block sending a message.
    try {
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    } catch {
      /* ignore */
    }
  }
  async function copy(code: string, key: string) {
    try {
      await navigator.clipboard.writeText(code);
      copied = key;
      setTimeout(() => (copied = ''), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  function grow(node: HTMLTextAreaElement) {
    const fit = () => {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 260)}px`;
    };
    node.addEventListener('input', fit);
    return { destroy: () => node.removeEventListener('input', fit) };
  }
  const QUICK = [
    { label: 'Explicar o arquivo aberto', prompt: 'Explique o que este arquivo faz, de forma direta.', file: true },
    { label: 'Caçar bugs', prompt: 'Revise este arquivo procurando bugs e riscos de segurança. Liste por gravidade.', file: true },
    { label: 'Escrever testes', prompt: 'Escreva testes para as partes mais importantes deste arquivo.', file: true },
    { label: 'Ideia de projeto', prompt: 'Me ajude a planejar um projeto novo: pergunte o essencial antes.', file: false },
  ];
</script>

<div class="aic">
  <header class="aic-head">
    <details class="aic-provider-picker">
      <summary aria-label="Escolher grupo e provedor"><span class="aic-picker-kicker">I.A</span><strong>{provider.name}</strong><span class="aic-picker-chevron">⌄</span></summary>
      <div class="aic-provider-menu" role="tablist" aria-label="Provedores de IA">
        <div class="aic-provider-group"><span>BOLSA I.A</span>{#each freeProviders as item}<button
          role="tab"
          aria-selected={id === item.id}
          class:on={id === item.id}
          class:free={item.id === 'minhavida'}
          on:click={() => selectedProvider.set(item.id)}
          >{#if item.id === 'minhavida'}<span class="aic-heart">♥</span>{/if}{item.name}<span class="aic-dot" class:ok={$providerStatus[item.id]?.configured} class:off={!item.supported}></span></button>{/each}</div>
        <div class="aic-provider-group"><span>Grau 33 Iluminate</span>{#each paidProviders as item}<button
          role="tab"
          aria-selected={id === item.id}
          class:on={id === item.id}
          on:click={() => selectedProvider.set(item.id)}
          >{item.name}<span class="aic-dot" class:ok={$providerStatus[item.id]?.configured} class:off={!item.supported}></span></button>{/each}</div>
      </div>
    </details>
    <div class="aic-model">
      <span class="aic-label">Modelo</span>
      {#if id === 'minhavida'}<select
          bind:value={$models.minhavida}
          disabled={busy || $catalogState !== 'ready'}
          aria-label="Modelo gratuito"
          >{#if $catalogState === 'ready'}{#each freeGroups as [company, list]}<optgroup
                label={company}
                >{#each list as m}<option value={m.id}
                    >{m.name.replace(/\s*\(free\)\s*$/i, '')}</option
                  >{/each}</optgroup
              >{/each}{:else}<option value={$models.minhavida}
              >{$catalogState === 'loading' ? 'Buscando modelos grátis...' : 'Lista indisponível'}</option
            >{/if}</select
        >{:else}<input
          list="aic-models"
          bind:value={$models[id]}
          disabled={busy || !provider.supported}
          spellcheck="false"
          aria-label="Identificador do modelo"
          placeholder="id do modelo"
        /><datalist id="aic-models"
          >{#each suggestions as m}<option
              value={companyPrefix ? m.id.slice(companyPrefix.length) : m.id}
              >{m.name} · US$ {m.inputPerMillion.toFixed(2)}/{m.outputPerMillion.toFixed(2)}</option
            >{/each}</datalist
        >{/if}
      <span class="aic-price" class:free={id === 'minhavida'}>{currentPrice}</span>
      {#if $catalogState === 'error' && !isPreview}<button class="aic-link" on:click={() => loadCatalog(true)}
          >recarregar preços</button
        >{/if}
    </div>
    <div class="aic-stats">
      <span title="Custo desta conversa"><b>{formatUsd(conversationCost, false, id === 'minhavida')}</b>conversa</span>
      <span title="Tokens usados nesta conversa"><b>{formatTokens(conversationTokens)}</b>tokens</span>
      <span title="Tamanho estimado do próximo envio"><b>~{formatTokens(contextTokens)}</b>contexto</span>
      <button
        class="aic-ghost"
        disabled={!messages.length || busy}
        on:click={() => clearConversation(id)}><Icon name="plus" size={13} />Nova conversa</button
      ><button class="aic-ghost" on:click={() => onConfigure(id)} title="Chave guardada no cofre do Windows"
        ><Icon name="key" size={13} />{status?.hint ?? 'Configurar'}</button
      >
    </div>
  </header>

  <div class="aic-scroll" bind:this={scroller} aria-live="polite">
    <div class="aic-column">
      {#if !provider.supported}
        <div class="aic-empty">
          <div class="aic-orb"><Icon name="box" size={30} /></div>
          <h2>{provider.name} chega em breve.</h2>
          <p>{provider.configurationHint}</p>
        </div>
      {:else if !status?.configured}
        <div class="aic-empty">
          <div class="aic-orb"><Icon name="key" size={30} /></div>
          <h2>{id === 'minhavida' ? 'IA de graça, sem cartão.' : `Conecte o ${provider.name}.`}</h2>
          <p>{provider.configurationHint}</p>
          <button class="aic-primary" on:click={() => onConfigure(id)} disabled={isPreview}
            ><Icon name="key" size={15} />Guardar minha chave</button
          >
          <small><Icon name="lock" size={11} />A chave vai para o Gerenciador de Credenciais do Windows e nunca volta para a tela.</small>
        </div>
      {:else if !messages.length}
        <div class="aic-empty">
          <div class="aic-orb glow"><Brain size={40} /></div>
          <h2>O que vamos construir hoje?</h2>
          <p>{provider.description}</p>
          <div class="aic-quick">
            {#each QUICK as q}<button
                disabled={busy || (q.file && !activeFile)}
                title={q.file && !activeFile ? 'Abra um arquivo primeiro' : ''}
                on:click={() => {
                  attach = q.file;
                  void submit(q.prompt);
                }}>{q.label}</button
              >{/each}
          </div>
          {#if !hasWorkspace}<button class="aic-link" on:click={onOpenWorkspace}
              ><Icon name="folder" size={13} />Abrir uma pasta de projeto</button
            >{/if}
        </div>
      {:else}
        {#each messages as message, index}
          {#if message.role === 'user'}
            <div class="aic-user">
              {#if message.attachment}<span class="aic-attach"
                  ><Icon name="code" size={12} />{message.attachment}</span
                >{/if}
              <p>{message.display ?? message.content}</p>
            </div>
          {:else}
            <article class="aic-answer">
              <div class="aic-answer-head">
                <span class="aic-avatar">{id === 'minhavida' ? '♥' : provider.name[0]}</span>
                <strong>{provider.name}</strong>
                {#if message.meta}<span class="aic-model-tag">{message.meta.model}</span>{/if}
              </div>
              {#each segments(message.content) as part, p}
                {#if part.kind === 'text'}<p class="aic-text">{part.text.trim()}</p>
                {:else}<div class="aic-code">
                    <div class="aic-code-head">
                      <span>{part.lang}</span>
                      <button on:click={() => copy(part.code, `${index}-${p}`)}
                        >{copied === `${index}-${p}` ? 'Copiado' : 'Copiar'}</button
                      >{#if onInsertCode}<button on:click={() => onInsertCode?.(part.code)}
                          >Inserir no cursor</button
                        >{/if}
                    </div>
                    <pre>{part.code}</pre>
                  </div>{/if}
              {/each}
              {#if message.meta}<footer class="aic-meta">
                  <span>{formatTokens(message.meta.inputTokens)} entrada</span>
                  <span>{formatTokens(message.meta.outputTokens)} saída</span>
                  <span class:est={message.meta.estimated}
                    >{formatUsd(message.meta.costUsd, message.meta.estimated, id === 'minhavida')}</span
                  >
                  <span>{(message.meta.latencyMs / 1000).toFixed(1)} s</span>
                </footer>{/if}
            </article>
          {/if}
        {/each}
      {/if}
      {#if busy}<div class="aic-thinking">
          <span class="aic-pulse"></span>{$models[id]} pensando · {elapsed}s
        </div>{/if}
      {#if $chatErrors[id]}<p class="aic-error" role="alert">{$chatErrors[id]}</p>{/if}
    </div>
  </div>

  <form class="aic-composer" class:locked={!status?.configured} on:submit|preventDefault={() => submit()}>
    <div class="aic-box">
      <textarea
        bind:this={input}
        bind:value={draft}
        use:grow
        rows="2"
        maxlength="30000"
        placeholder={status?.configured ? 'Peça, pergunte, cole um erro...' : 'Configure a chave para conversar'}
        disabled={!status?.configured || busy}
        on:keydown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}></textarea>
      <div class="aic-box-bar">
        <button
          type="button"
          class="aic-chip"
          class:on={attach && activeFile}
          disabled={!activeFile}
          title="Envia o conteúdo do arquivo aberto junto com a mensagem"
          on:click={() => (attach = !attach)}
          ><Icon name="code" size={12} />{activeFile
            ? `${attach ? 'Enviando' : 'Anexar'} ${activeFile.name} · ~${formatTokens(roughTokens(activeFile.content))} tokens`
            : 'Nenhum arquivo aberto'}</button
        >
        {#if $overBudget && id !== 'minhavida'}<span class="aic-warn">limite de hoje atingido</span>{/if}
        <span class="aic-hint">Enter envia · Shift Enter quebra</span>
        <button class="aic-send" type="submit" disabled={!draft.trim() || busy || !status?.configured}
          aria-label="Enviar"><Icon name="arrow" size={17} /></button
        >
      </div>
    </div>
  </form>
</div>
