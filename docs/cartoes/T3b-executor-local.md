# Cartão T3b — Executor local com contenção

> Cartão de trabalho emitido pelo CTO, no formato de `factory-ia/PARALELO.md §3`.
> Não é regra de processo: é um item de trabalho. A regra continua em `factory-ia/`.

**Para quem pegar esta tarefa no Cursor (Grok ou outro).** Declare o papel no início de
cada resposta, como manda `factory-ia/AGENTS.md`.

## Antes de escrever qualquer linha

Leia, nesta ordem:

1. `factory-ia/AGENTS.md` — o fluxo e a governança.
2. `factory-ia/dominio/MISSAO.md`, `STACK.md`, `REGRAS.md` — **a regra 3 é o eixo deste cartão**.
3. `docs/adr/0007-execucao-via-cli-local.md` — a decisão que este cartão implementa.
4. `factory-ia/personas/` — a ficha de Backend.
5. `packages/mcp-harness/README.md` — a porta que o agente contido vai usar.

## Onde o trabalho parou

| Entregue | O quê |
| --- | --- |
| `a669c18` | Harness ligado ao envio do chat (`src/application/harness-gate.ts`) |
| `1f658d0` | Servidor MCP `donkey-harness` com auditoria |
| `e6f445e` | ADR-007 adotada e regra 3 do domínio (perímetro de confiança) |
| `a612810` | Acesso mediado ao projeto: `listar_arquivos`, `ler_arquivo`, `buscar_no_projeto` |

O princípio que rege tudo: **o Donkey vê tudo porque representa o desenvolvedor; a empresa
terceira não vê nada que não tenha passado pelo Harness.** Um CLI de fornecedor rodando nesta
máquina conta como Grau 33, não como Donkey.

## Correção de escopo que você precisa saber

A ADR-007 escolheu `ollama` como primeiro alvo. Ao detalhar o cartão, apareceu um limite:

- Neste código o Ollama é **HTTP** em `127.0.0.1:11434`, não um CLI agêntico
  (`src-tauri/src/infrastructure/providers.rs`).
- Ollama **não tem ferramentas**: não lê disco nem roda comando.

Logo, o Ollama valida o **ciclo de vida do subprocesso e o fluxo de eventos**, mas **não**
valida a trava de negar ferramentas nativas — não há o que negar.

**Por isso a contenção é provada com um CLI de mentira**, uma fixture de teste que tenta
escapar de propósito. A trava precisa existir e falhar barulhento agora, muito antes de o
primeiro CLI agêntico de verdade encostar aqui.

## O cartão

```text
id: T3b
classe: F
dono: backend
objetivo: executor de processo local contido, com fluxo de eventos para a interface
arquivos_exclusivos:
  - src-tauri/src/infrastructure/executor.rs
  - src/application/cli-executor.ts
  - src/application/cli-executor.test.ts
arquivos_compartilhados (só as linhas de registro, nada mais):
  - src-tauri/src/presentation/commands.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/infrastructure/mod.rs
depende_de: [T3a entregue]
paralelo_com: nenhum
decisao_compartilhada: formato do evento de execução (congele antes de codar a interface)
entrega: código + testes + resumo do que mudou + como o QA verifica
proibido:
  - tocar em src/presentation/** (é o cartão T3c)
  - tocar em packages/mcp-harness/** (entregue, outro dono)
  - git push, PR, merge ou release
```

## O que construir

### 1. `executor.rs` — o subprocesso contido

Travas obrigatórias, cada uma com teste:

1. **Lista fixa de binários.** Só o que estiver na constante do código roda. Primeira versão:
   `ollama` e nada mais. Caminho de executável vindo de fora é recusado, igual já se faz com a
   lista de shells em `pty.rs` — use aquele arquivo como referência de estilo.
2. **Raiz restrita.** O processo nasce num diretório dedicado, nunca no workspace do usuário.
   Se a raiz pedida ficar fora dela, recusa.
3. **Ambiente limpo.** Não herde o ambiente inteiro do pai. Repasse só o mínimo; nada de
   variável com chave, token ou caminho pessoal.
4. **Limites.** Tempo máximo, tamanho máximo de saída acumulada e encerramento de verdade
   (o processo morre, não fica órfão). Veja `process.rs`, que já faz isso para o Git.
5. **Lista de permissão de ferramentas.** A estrutura precisa existir já: o executor declara
   o que o processo pode usar e repassa isso na linha de comando do alvo. Com o Ollama ela fica
   vazia — documente isso no código, não finja que está testada em campo.

### 2. `cli-executor.ts` — contrato e eventos

- Tipos do evento de execução: início, saída parcial, erro, fim, com o que a linha do tempo
  do T3c vai precisar. **Congele esse formato antes de qualquer tela**, é a decisão compartilhada.
- Tradutor por alvo, isolado: quando entrar um CLI com formato próprio de saída, ele quebra
  num arquivo só.
- Nenhum envio nasce aqui sem passar antes por `src/application/harness-gate.ts`. Se o veredito
  não for `safe`, o executor **não sobe o processo**.

### 3. Testes que provam a contenção

Use uma **fixture que tenta escapar**: um script pequeno, criado no próprio teste, que tenta
ler um arquivo fora da raiz e gravar fora dela. O teste passa quando a tentativa falha.

Cobertura mínima:

- binário fora da lista → recusado;
- raiz fora do diretório dedicado → recusado;
- a fixture não alcança arquivo fora da raiz;
- processo que estoura o tempo é morto;
- saída gigante não estoura a memória;
- veredito diferente de `safe` impede o processo de nascer.

## Pronto quando

- [ ] As seis travas acima com teste, em Rust e em TypeScript conforme o lado.
- [ ] `npm run check` sem erro.
- [ ] `npm run test` e `npm run test:rust` verdes.
- [ ] `npm run test:mcp` e `npm run test:harness` seguem verdes (você não deve ter quebrado nada lá).
- [ ] `CHANGELOG.md` atualizado em "Não lançado".
- [ ] Resumo com: arquivos tocados, riscos, e **o que você não fez**.
- [ ] QA → Security → Reviewer, nessa ordem, cada um podendo vetar.

## Regras que não se afrouxam

- **Nada de `git push`, PR, merge ou release sem o "sim" do humano.** Commit local pode,
  depois das aprovações, em português e no imperativo.
- **Segredo não se lê.** `.env`, `*.pem`, `*.key`, `config.local.*` — nem para testar.
- **Não invente domínio.** Se a regra não está em `factory-ia/dominio/` nem no código,
  pergunte ao humano. Não copie de `factory-ia/dominio/exemplos/`.
- **Não saia dos `arquivos_exclusivos`.** Precisou de outro caminho? Pare e devolva ao CTO.
  Nem "só um import" em arquivo alheio.
- Falha ao usuário em português, sem stack, sem caminho interno, sem PII.

## Armadilha conhecida

É tentador fazer o executor repassar o workspace inteiro ao processo, porque assim "funciona
melhor". **Isso anula o produto.** O agente contido enxerga o projeto pelas ferramentas do
servidor MCP (`listar_arquivos`, `ler_arquivo`, `buscar_no_projeto`), que devolvem conteúdo já
auditado — é exatamente para isso que o T3a existe. Se a contenção estiver atrapalhando, o
caminho é melhorar o acesso mediado, nunca abrir a raiz.

## O próximo cartão (não é este)

**T3c** — linha do tempo de rastreio na interface, consumindo os eventos congelados aqui.
Só comece depois que este fechar com Reviewer aprovado.
