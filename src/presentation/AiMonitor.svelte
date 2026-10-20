<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getProvider } from '../domain/providers';
  import {
    byModel,
    dailyCost,
    formatTokens,
    formatUsd,
    startOfDay,
    totals,
  } from '../domain/ai-metrics';
  import {
    activity,
    dailyBudget,
    models,
    pending,
    providerStatus,
    requests,
    selectedProvider,
    todayTotals,
  } from './ai-store';
  import Icon from './Icon.svelte';

  let tab: 'requests' | 'actions' = 'requests';
  let now = Date.now();
  const clock = setInterval(() => (now = Date.now()), 30_000);
  onDestroy(() => clearInterval(clock));

  $: month = totals($requests.filter((r) => r.time >= now - 30 * 86_400_000));
  $: all = totals($requests);
  $: days = dailyCost($requests, 14, now);
  $: maxDay = Math.max(...days, 0.0001);
  $: perModel = byModel($requests.filter((r) => r.time >= now - 30 * 86_400_000)).slice(0, 8);
  $: maxModel = Math.max(...perModel.map((m) => m.totals.costUsd || m.totals.requests * 1e-9), 1e-9);
  $: budgetUse = $dailyBudget > 0 ? Math.min(1, $todayTotals.costUsd / $dailyBudget) : 0;
  $: running = Object.entries($pending).filter(([, v]) => v).map(([k]) => k);
  $: current = getProvider($selectedProvider);

  function time(value: number) {
    const d = new Date(value);
    return value >= startOfDay(now)
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  const ICON: Record<string, string> = {
    ai: 'spark',
    file: 'save',
    git: 'branch',
    terminal: 'terminal',
    run: 'monitor',
    system: 'settings',
  };
</script>

<aside class="aim">
  <div class="aim-head">
    <h2>Monitor de IA</h2>
    <span class="aim-live" class:busy={running.length}>{running.length ? 'em uso' : 'ocioso'}</span>
  </div>

  <div class="aim-scroll">
    <section class="aim-now">
      <span class="aim-label">Rodando agora</span>
      <strong>{current.name}</strong>
      <code>{$models[$selectedProvider] || '—'}</code>
      <span class="aim-key" class:ok={$providerStatus[$selectedProvider]?.configured}
        ><Icon name="lock" size={11} />{$providerStatus[$selectedProvider]?.configured
          ? `chave ${$providerStatus[$selectedProvider]?.hint ?? ''}`
          : 'sem chave'}</span
      >
    </section>

    <section class="aim-kpis">
      <div><span>Hoje</span><b>{formatUsd($todayTotals.costUsd)}</b></div>
      <div><span>30 dias</span><b>{formatUsd(month.costUsd)}</b></div>
      <div>
        <span>Requisições hoje</span><b
          >{$todayTotals.requests}{#if $todayTotals.errors}<em> · {$todayTotals.errors} erro</em>{/if}</b
        >
      </div>
      <div>
        <span>Tokens hoje</span><b
          >{formatTokens($todayTotals.inputTokens)}<em>↑</em> {formatTokens($todayTotals.outputTokens)}<em
            >↓</em
          ></b
        >
      </div>
      <div><span>Latência média</span><b>{($todayTotals.avgLatencyMs / 1000).toFixed(1)} s</b></div>
      <div><span>Total geral</span><b>{formatUsd(all.costUsd)}</b></div>
    </section>
    {#if month.unknownCost}<p class="aim-note">
        {month.unknownCost} resposta(s) sem preço conhecido no catálogo: custo não somado.
      </p>{/if}

    <section class="aim-card">
      <div class="aim-row">
        <span class="aim-label">Limite diário</span>
        <label class="aim-budget"
          >US$ <input
            type="number"
            min="0"
            step="0.5"
            value={$dailyBudget || ''}
            placeholder="sem"
            on:change={(e) => dailyBudget.set(Math.max(0, Number(e.currentTarget.value) || 0))}
          /></label
        >
      </div>
      {#if $dailyBudget > 0}<div class="aim-bar">
          <i style:width={`${budgetUse * 100}%`} class:hot={budgetUse >= 0.8}></i>
        </div>
        <span class="aim-sub"
          >{Math.round(budgetUse * 100)}% usado · ao atingir, só o Modal minha vida continua</span
        >{/if}
    </section>

    <section class="aim-card">
      <span class="aim-label">Gasto · 14 dias</span>
      <div class="aim-spark" role="img" aria-label="Gasto diário dos últimos 14 dias">
        {#each days as value, i}<i
            style:height={`${Math.max(3, (value / maxDay) * 100)}%`}
            class:today={i === days.length - 1}
            title={formatUsd(value)}
          ></i>{/each}
      </div>
    </section>

    <section class="aim-card">
      <span class="aim-label">Por modelo · 30 dias</span>
      {#each perModel as m}<div class="aim-model">
          <div class="aim-row">
            <span title={m.model}>{m.model}</span><b
              >{formatUsd(m.totals.costUsd, false, m.provider === 'minhavida')}</b
            >
          </div>
          <div class="aim-bar thin">
            <i style:width={`${((m.totals.costUsd || m.totals.requests * 1e-9) / maxModel) * 100}%`}></i>
          </div>
          <span class="aim-sub"
            >{getProvider(m.provider).name} · {m.totals.requests} req · {formatTokens(
              m.totals.inputTokens + m.totals.outputTokens,
            )} tokens</span
          >
        </div>{/each}
      {#if !perModel.length}<p class="aim-note">Nenhuma requisição ainda.</p>{/if}
    </section>

    <div class="aim-tabs">
      <button class:on={tab === 'requests'} on:click={() => (tab = 'requests')}
        >Requisições <b>{$requests.length}</b></button
      ><button class:on={tab === 'actions'} on:click={() => (tab = 'actions')}
        >Ações <b>{$activity.length}</b></button
      >
    </div>
    {#if tab === 'requests'}
      {#each [...$requests].reverse().slice(0, 80) as r (r.id)}<div class="aim-req" class:err={r.status === 'error'}>
          <time>{time(r.time)}</time>
          <div>
            <strong>{r.model}</strong>
            <span
              >{#if r.status === 'error'}{r.error}{:else}{formatTokens(r.inputTokens)}↑ {formatTokens(
                  r.outputTokens,
                )}↓ · {(r.latencyMs / 1000).toFixed(1)}s{#if r.contextFile} · {r.contextFile}{/if}{/if}</span
            >
          </div>
          <b class:est={r.estimated}>{r.status === 'error' ? 'erro' : formatUsd(r.costUsd, r.estimated, r.provider === 'minhavida')}</b>
        </div>{/each}
      {#if $requests.length}<button class="aim-clear" on:click={() => requests.set([])}
          >Limpar histórico de requisições</button
        >{/if}
    {:else}
      {#each [...$activity].reverse().slice(0, 120) as a}<div class="aim-act">
          <Icon name={ICON[a.kind] ?? 'spark'} size={12} /><span>{a.message}</span><time
            >{time(a.time)}</time
          >
        </div>{/each}
      {#if $activity.length}<button class="aim-clear" on:click={() => activity.set([])}
          >Limpar ações</button
        >{/if}
    {/if}
  </div>
</aside>
