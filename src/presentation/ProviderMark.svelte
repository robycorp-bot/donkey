<script lang="ts">
  import type { ProviderId } from '../domain/models';
  import anthropic from '../assets/providers/anthropic.svg?url';
  import codex from '../assets/providers/codex.svg?url';
  import copilot from '../assets/providers/copilot.svg?url';
  import google from '../assets/providers/google.svg?url';
  import grok from '../assets/providers/grok.svg?url';
  import ollama from '../assets/providers/ollama.svg?url';
  import openrouter from '../assets/providers/openrouter.svg?url';

  export let id: ProviderId;
  export let name: string;

  /** Arquivos locais. Marcas pretas (currentColor) invertem no tema escuro. */
  const logos: Record<ProviderId, { src: string; mono: boolean }> = {
    minhavida: { src: openrouter, mono: true },
    openrouter: { src: openrouter, mono: true },
    openai: { src: codex, mono: false },
    anthropic: { src: anthropic, mono: false },
    google: { src: google, mono: false },
    grok: { src: grok, mono: true },
    ollama: { src: ollama, mono: true },
    copilot: { src: copilot, mono: false },
  };

  $: logo = logos[id];
</script>

<img class="provider-logo" class:mono={logo.mono} src={logo.src} alt={name} width="16" height="16" />
