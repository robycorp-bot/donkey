# Missão do projeto

**Nome:** Donkey

**Uma frase:** Editor e chat para desenvolvedores que atua como **meio de campo seguro** entre o seu código/dados e os modelos de linguagem (LLMs de terceiros), preservando qualidade do trabalho sem expor informação sigilosa.

**Não é:**

- Um chat genérico “para todo mundo” que envia contexto inteiro ao provedor.
- Um substituto do Cursor, Claude Code ou Grok como produto do fornecedor.
- Uma promessa de que LLMs são confiáveis; tratamos integrações externas como **Grau 33** (zonas não confiáveis).
- Um sistema orientado só a **custo mínimo**; o núcleo é **segurança da informação** e **qualidade do que replica** para fora.

**Usuários:** Desenvolvedores de software (uso pessoal ou time técnico) que precisam gerar código, relatórios e automações com IA **sem treinar modelos terceiros com dados reais** de clientes, produção ou ambientes regulados (LGPD).

**Fora de escopo (agora):**

- Execução autônoma de agentes com acesso irrestrito ao disco sem revisão humana.
- Hospedagem multi-tenant SaaS ou sincronização de conversas na nuvem do fornecedor.
- Paridade com extensões do VS Code ou runtime oficial do Copilot/Codex.
- Certificação jurídica ou auditoria formal LGPD (o produto **apoia** conformidade técnica; o DPO humano decide política).

**Critério de sucesso do produto:**

1. O desenvolvedor obtém **o mesmo tipo de entrega** (código, script, relatório) que obteria no Cursor/CLI direto, mas o que foi enviado aos **Grau 33** foi **redigido, resumido ou sintetizado** — estrutura fiel, conteúdo não sigiloso.
2. Tentativas de vazamento (CPF, conta, nota fiscal, PII conforme política) são **detectadas**, **bloqueadas ou marcadas para “auditar solicitação”** antes do envio.
3. Roteamento de modelo é **justo**: tarefa simples não é empurrada ao modelo mais caro por padrão.
4. Provedores prioritários integrados: **Claude (Anthropic)**, **Grok (xAI)** e modelos do **pacote Cursor**, além dos demais já suportados quando configurados.
