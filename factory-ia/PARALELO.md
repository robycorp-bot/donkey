# PARALELO.md — trabalho conjunto sem atropelo

O CTO DEVE usar este protocolo ao quebrar uma demanda. Especialistas DEEM seguir o
cartão que receberam. Ferramentas com subagentes disparam frentes independentes ao
mesmo tempo; em sessão única, o plano continua paralelo, a execução é sequencial
por papel, sem misturar responsabilidades.

## 1. Quando paralelizar

Paralelize se **todas** forem verdade:

- Arquivos exclusivos por tarefa (sem interseção de caminhos).
- Nenhuma decisão compartilhada ainda aberta (contrato de API, schema, auth, nome
  público, formato de evento).
- Critério de pronto da tarefa não depende do output ainda não entregue da outra.
- Ninguém vai commitar, fazer merge nem publicar.

Exemplos que **podem** ir em paralelo: Backend na rota A e Frontend na tela B depois
do contrato congelado; Database no schema C e Documentation no README; QA de um
módulo já fechado enquanto outro especialista implementa outro módulo.

## 2. Quando NÃO paralelizar

Serialize se **qualquer** for verdade:

- O mesmo arquivo (ou o mesmo bloco de um arquivo gerado).
- Decisão ainda solta da qual as duas frentes dependem.
- Schema/contrato ainda não aprovado pelo Architect + CTO, e o código vai usá-lo.
- Git (branch compartilhada, index, PR) — só o Git Agent, depois das aprovações.
- Produção, migração real, restore, apagar dado.
- Edição de processo em `factory-ia/` (fora de `dominio/`) **e** `factory-ia/dominio/REGRAS.md` ao mesmo tempo (uma caneta só).
- Reviewer/Security/QA do **mesmo** diff — podem ler juntos, mas o parecer de veto
  é um por papel, em sequência QA → Security → Reviewer.

## 3. Cartão de tarefa (CTO emite, especialista devolve)

```text
id: T3
classe: F
dono: backend
objetivo: persistir fatura após o contrato POST /invoices congelado
arquivos_exclusivos:
  - src/billing/invoice_service.py
  - src/billing/invoice_repo.py
depende_de: [T1]
paralelo_com: [T4]
decisao_compartilhada: nenhuma
entrega: código + resumo do que mudou + como o QA verifica
proibido: alterar src/http/routes.py (dono: architect)
```

O especialista NÃO altera caminho fora de `arquivos_exclusivos`. Se precisar, para
e devolve ao CTO. Não “só um import” em arquivo alheio.

## 4. Como o orquestrador decide

1. Lista decisões que precisam existir **antes** do código (contrato, schema, auth).
   Uma frente só (em geral Architect, às vezes Product) congela cada decisão.
2. Parte o restante por **arquivo**, não por “tema vago”.
3. Marca `depende_de` / `paralelo_com`.
4. Dispara só o conjunto cuja dependência já está **entregue**.
5. Recolhe as entregas, confere interseção de arquivos. Se houver interseção:
   **para**, não funde no escuro, reatribui ou serializa.
6. Só então chama QA → Security → Reviewer no conjunto.

CTO NÃO escreve o código dos especialistas. CTO NÃO centraliza implementação.
CTO coordena, arbitra e aprova.

## 5. Fusão

- Cada frente devolve: lista de arquivos tocados, resumo, riscos, o que não fez.
- Interseção vazia + cartões cumpridos → o conjunto segue para QA.
- Interseção não vazia → CTO declara dono do arquivo e manda a outra frente rebasear
  em cima, sem copiar no escuro.
- Conflito de regra de negócio → vale `factory-ia/dominio/REGRAS.md`; se não cobrir, pergunte
  ao humano. Não invente.
- Conflito de processo → vale `factory-ia/AGENTS.md`.
- Quem funde Git é o Git Agent, depois de Reviewer + CTO + "sim" do humano.

## 6. Sessão única (sem subagentes)

Percorra os papéis na ordem do fluxo, um de cada vez, rotulando `[Papel]`.
Você PODE planejar cartões paralelos, mas NÃO misture Backend e Frontend no mesmo
bloco de edição. Termine uma frente, entregue o cartão, só então a próxima.

## 7. Subagentes

- Um subagente = um cartão. Não peça dois donos no mesmo processo.
- Passe o cartão inteiro + “leia factory-ia/AGENTS.md, a ficha, e factory-ia/dominio/REGRAS.md”.
- Limite ferramentas dos papéis de veto conforme a ficha (não dar escrita ao Reviewer).
- Se dois subagentes reportarem o mesmo arquivo, descarte a fusão automática.

## 8. Anti-padrões

- Dois agentes no mesmo arquivo “porque é rápido”.
- Frontend inventando o contrato enquanto Backend inventa outro.
- Especialista aprovando o próprio trabalho.
- Git Agent commitando no meio de frentes abertas.
- Copiar `factory-ia/dominio/exemplos/` para dentro do código do projeto-filho sem o humano pedir.
