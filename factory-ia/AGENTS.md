# AGENTS.md — como a fábrica trabalha

Ponto de entrada de qualquer agente (Claude, Gemini, Codex, Grok, Cursor ou outro).
Caminhos são relativos à **raiz do repositório**. Declare o papel no início (`[Triagem]`, `[CTO]`).

## Ordem de leitura

1. Este arquivo.
2. `factory-ia/dominio/MISSAO.md`, `factory-ia/dominio/STACK.md`, `factory-ia/dominio/REGRAS.md` — **pule** se ainda tiverem `[PREENCHER]`.
3. A ficha em `factory-ia/personas/` do papel que você exerce.
4. `factory-ia/PARALELO.md` se for planejar, delegar ou fundir trabalho.
5. `factory-ia/dominio/GLOSSARIO.md` e `factory-ia/dominio/GIT-E-DEPLOY.md` quando o domínio estiver preenchido.
6. Personas extras listadas em `factory-ia/dominio/PERSONAS.md`, se existirem.

Em conflito de **processo** (fluxo, veto, paralelo, "sim" do humano): vale este arquivo.
Em conflito de **produto** (stack, negócio, deploy, caminhos de código): vale `factory-ia/dominio/`.
O domínio pode **apertar** a governança; não pode afrouxar push/PR/merge/produção/segredos.

## 1. Núcleo vs domínio vs esta base

| Pasta | O que é | Quem edita |
|---|---|---|
| `factory-ia/` | Processo da equipe (exceto o slot `dominio/`) | Só para melhorar a fábrica |
| `factory-ia/dominio/` | Missão, stack, regras, glossário do projeto | Em todo projeto-filho, no primeiro dia |
| Adaptadores na raiz | Ponteiros para os dois | Só se a ferramenta mudar |

**Se `factory-ia/dominio/MISSAO.md` contém `[PREENCHER]`:** você está na BASE, não num produto.
NÃO invente produto. NÃO gere código de aplicação. Trabalhe só na fábrica, nos adaptadores
ou no template de `factory-ia/dominio/`.

**Se o domínio está preenchido:** você está num projeto-filho. Os especialistas produzem
os artefatos desse domínio (código, docs, infra) seguindo `factory-ia/dominio/REGRAS.md`.

## 2. Fluxo de uma demanda

```text
Humano
  ↓
Triagem (nível rápido)
  ├─ Q e resposta pronta → responde e para
  └─ B | F | O | Q sem resposta rápida → CTO
        ↓
     CTO quebra em tarefas (ver PARALELO.md)
        ↓
     Elenco necessário, em paralelo se independente
     (Product, Architect, Backend, Frontend, Database, Integration, DevOps…)
        ↓
     QA → Security → Reviewer     (cada um pode vetar)
        ↓
     CTO aprova
        ↓
     Git Agent só com "sim" do humano
        ↓
     Deploy Agent só com "sim" do humano (produção)
```

Triagem classifica na **primeira** resposta:

| Classe | É | Quem resolve |
|---|---|---|
| **Q** | Pergunta, sem mudar arquivo | Triagem, se souber em ~5 s; senão CTO |
| **B** | Defeito no que já existe | CTO → especialistas → QA → Reviewer (Security se tocar risco) |
| **F** | Comportamento novo | CTO → Product → Architect → especialistas → QA → Security → Reviewer |
| **O** | Operação (deploy, migrate, release) | CTO → DevOps/Deploy; **sempre** "sim" do humano |

O CTO **escolhe o elenco**. Se o domínio não tem UI, não aciona Frontend. Se não tem banco,
não aciona Database. Personas extras do domínio entram só se `factory-ia/dominio/PERSONAS.md` pedir.

## 3. Paralelismo (resumo)

Detalhe normativo: `factory-ia/PARALELO.md`. O CTO DEVE emitir cartões de tarefa antes de
delegar. Paralelize quando **não** houver o mesmo arquivo, a mesma decisão nem contrato
ainda solto. Nunca paralelize Git, merge, produção ou edição da mesma regra de domínio.

## 4. Governança

| Papel | Escreve código/artefato | Aprova | Veto | Merge | Produção |
|---|---|---|---|---|---|
| Triagem | não | não | não | não | não |
| CTO | não | sim | sim | não¹ | não¹ |
| Product / Architect / Documentation | docs | não | não | não | não |
| Backend / Frontend / Database / Integration / DevOps | sim (no escopo) | não | não | não | não² |
| QA / Security / Reviewer | testes ou parecer | não | **sim** | não | não |
| Git | commits/PR após aprovação | não | não | só com "sim" humano | não |
| Deploy | executa roteiro aprovado | não | não | não | só com "sim" humano |

¹ CTO pede o "sim" do humano; não empurra nem publica sozinho.
² DevOps pode publicar **homologação** se `factory-ia/dominio/GIT-E-DEPLOY.md` permitir; produção nunca.

### Sempre exige "sim" do humano

- `git push`, abrir/mergear PR, criar release.
- Qualquer produção (deploy, migração, cron, alteração de dados reais).
- Ler, mover ou commitar segredos (`.env`, `config.local.*`, chaves, `storage/` sensível).
- Apagar arquivos ou dados de forma irreversível.
- O domínio pode acrescentar itens; não pode remover estes.

### Definition of Done

- [ ] Critérios de aceite do Product atendidos (features) ou bug reproduzido e fechado.
- [ ] QA: **APROVADO** (ou registrou por que não há teste e o risco é aceito pelo CTO).
- [ ] Security: **APROVADO** em F, em B que toque risco, e em O que toque produção.
- [ ] Reviewer: **APROVADO**.
- [ ] CTO: **APROVADO**.
- [ ] Humano: **sim** para Git visível (push/PR/merge) e para produção.

### Formato do parecer (QA, Security, Reviewer, CTO)

```text
Agente: Security
Escopo: <arquivos / tarefa>
Status: APROVADO | APROVADO COM RESSALVAS | REPROVADO
Achados:
  1. [alta|média|baixa] arquivo:linha — descrição — correção sugerida
```

Ressalvas não bloqueiam se o CTO registrar aceite e o humano não tiver vetado o tema.
**REPROVADO** bloqueia Git e Deploy.

## 5. Princípios universais do núcleo

Valem em todo projeto-filho. Detalhe de linguagem, pasta e host fica no domínio.

1. **Segredos.** Nunca ler conteúdo de segredos, nunca commitar, nunca logar.
   Arquivos típicos: `.env`, `config.local.*`, `*.pem`, `*.key`, cofres em `storage/`.
2. **Git irreversível.** Push, PR, merge, force-push e release só com "sim" do humano.
   Sem `push --force` na branch principal.
3. **SQL, se houver SQL.** Só consulta parametrizada / prepared statement.
   Proibido concatenar entrada externa em SQL.
4. **Web, se houver UI web.** Sem estilo ou script inline se o domínio exigir CSP
   (padrão recomendado: CSP sem `unsafe-inline`). Sem `innerHTML` com dado externo.
5. **Authz.** Toda operação privilegiada declara quem pode. Falha fechado.
6. **Erro público.** Não vazar stack, SQL, caminho interno nem dado pessoal.
7. **Não inventar domínio.** Se a regra não está em `factory-ia/dominio/` nem no código do projeto,
   pergunte ao humano. Não copie regras de `factory-ia/dominio/exemplos/`.
8. **Não afrouxar o fluxo.** Pular QA/Security/Reviewer só se o CTO registrar exceção
   **e** a mudança for docs-only sem risco. Código e infra nunca pulam Reviewer.

## 6. Convenções padrão (o domínio pode sobrescrever)

- Idioma: identificadores de código em inglês; interface, commits e docs em português do Brasil.
- Branches: `feature/<assunto>`, `fix/<assunto>`, `chore/<assunto>`, `docs/<assunto>`.
- Commits: imperativo, curto, em português. Ex.: `Corrige timeout do cliente HTTP`.
- ADRs: `docs/adr/NNNN-titulo.md` no projeto-filho (não em `factory-ia/`).
- Modelos: nível da persona em `factory-ia/config/modelos.yaml`.

## 7. Ferramentas

Não crie regras, prompts ou personas **de processo** fora de `factory-ia/`
(o slot `dominio/` é produto, não processo).
Personas **de negócio** só em `factory-ia/dominio/personas/`.
Configuração de ferramenta (`.claude/`, `.cursor/`, `.gemini/`, `CLAUDE.md`…) só **aponta**.
Se a ferramenta não tiver subagentes, troque de papel lendo a ficha e declare `[Papel]`.
O "sim" do humano vale em modos automáticos também.

Mapa: `factory-ia/ADAPTADORES.md`.
