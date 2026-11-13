# Visão do Donkey

## Mudança de eixo

Antes, a narrativa enfatizava leveza e custo baixo. **O núcleo agora é segurança da informação e qualidade do que replicamos para fora** — com uso justo de tokens, não o modelo mais caro por padrão.

Este produto é **para desenvolvedores**: quem precisa escrever código e automações com IA sem entregar dados reais de clientes, produção ou ambientes regulados aos fornecedores de modelo.

## O problema que resolvemos

Hoje, o desenvolvedor pede ao Cursor ou a um CLI: “leia estes XMLs e gere o relatório”. O modelo **lê os dados reais**, entrega um ótimo resultado — e **já viu** CPF, valores, notas e estrutura comercial.

Com o Donkey, o **mesmo código final** pode ser produzido treinando o raciocínio do modelo em **dados sintéticos** (mesma forma, conteúdo fictício). Quando o script ou app rodar **na máquina do desenvolvedor**, ele processa dados reais — porque o executável é dele; o Grau 33 só ajudou a escrever.

```text
[Workspace real]     [Harness local]              [Grau 33 — LLM terceiro]
      │                      │                              │
      │  XML/JSON com PII      │  detecta / redige / resume   │  vê só estrutura
      └──────────────────────┤  sintetiza se preciso          │  e trechos seguros
                             └───────────────────────────────►│
                                                              │
                             ◄───────────────────────────────┘
                                      código / plano / diff
```

## Princípios

1. **Controle e qualidade:** Replicar o máximo de contexto útil **de forma segura** — resumo fiel, esquemas, interfaces — não dump bruto.
2. **Não confiar em LLM:** Provedores externos são **Grau 33**; o Donkey é o adulto na sala.
3. **LGPD por padrão:** CPF, conta bancária, chave de nota, e-mails e telefones de titular, e padrões configuráveis **não** seguem para a API sem passar pelo Harness e, se necessário, **auditar solicitação**.
4. **Ética de custo:** Roteamento escolhe modelo adequado à tarefa (planejar ≠ redigir 10k linhas); evitar “sempre o flagship”.
5. **Tom do produto:** Mensagens animadas e honestas (“sua solicitação está infiltrada”, “auditar solicitação”) — sem infantilizar o risco.

## Matriz de trabalho (produto)

| Pilar | Entrega |
| --- | --- |
| **Chat** | Interface completa, bonita, multi-provedor; envio sempre mediado pelo Harness (integração progressiva). |
| **Harness** | Pacote `packages/harness/`: auditoria, redação, resumo local/servidor futuro, síntese estrutural. |
| **Editor** | Monaco + workspace local; contexto para o Harness é **seleção explícita**, não leitura silenciosa do disco. |
| **Integrações prioritárias** | Claude (Anthropic), Grok (xAI), modelos do pacote Cursor; demais provedores conforme `PROVEDORES.md`. |

## Grau 33

Nome interno (e na UX, com humor) para **qualquer modelo hospedado por terceiro**. Não importa a marca: se não roda no seu perímetro de confiança, é Grau 33.

## IA local (futuro próximo)

Resumo e classificação de prompts grandes podem usar **modelo local** (ex. Ollama) para não mandar o texto inteiro ao Grau 33. O Harness já nasce com contratos para isso; a implementação local é etapa do roadmap.

## Documentos relacionados

- Domínio (agentes): `factory-ia/dominio/MISSAO.md`, `REGRAS.md`, `GLOSSARIO.md`
- ADR: `docs/adr/0006-harness-meio-de-campo.md`
- Código Harness: `packages/harness/README.md`
- Arquitetura atual: `ARQUITETURA.md`
