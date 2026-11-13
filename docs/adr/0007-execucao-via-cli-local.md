# ADR-007 — Execução delegada ao CLI local e MCP do Harness

**Estado:** **adotada em 2026-11-13**, com escopo declarado pelo humano: **uso pessoal, executável
não compartilhado**. Distribuir o Donkey com o executor a terceiros exige decisão nova antes de
qualquer release.

## Contexto

O Donkey precisa entregar o mesmo resultado que o desenvolvedor teria usando o Claude, o Grok ou
o Codex direto, mas com o Harness no meio do campo. Hoje o app fala com os provedores por **API
key** (ADR-003, ADR-004). Isso funciona, mas tem três limites:

1. **Custo duplicado.** O usuário já paga assinatura do CLI; a API key cobra de novo, por token.
2. **Capacidade menor.** O CLI do fornecedor traz agente, ferramentas, aplicação de patch e
   sessão — a API crua entrega só texto.
3. **Sem rastreio.** A API devolve a resposta pronta; o CLI em modo headless emite o passo a passo.

Surgiu a hipótese de **usar o login do Google como credencial comum**, já que as ferramentas
aceitam "entrar com Google". A hipótese não se sustenta: nessas ferramentas o Google é apenas
**provedor de identidade**. Quem emite e valida a sessão é a Anthropic, a xAI, a Cursor ou a
OpenAI, cada uma com seu token, no seu próprio armazenamento. Um token do Google não autentica
nenhuma delas, e o Donkey não tem como derivar um do outro.

O que de fato é comum entre essas ferramentas é outra coisa: **todas já estão autenticadas nesta
máquina**, cada uma na sua sessão, paga pelo usuário.

## Modelo de confiança (o eixo desta ADR)

A fronteira **não** é "programa automático versus humano". É **dentro desta máquina versus
empresa terceira**.

- O **Donkey é o editor do desenvolvedor**: representa ele no trabalho e enxerga o que ele
  enxerga. Ler o workspace inteiro não é risco — é a função. **Ele filtra porque vê.**
- O **CLI delegado não é o Donkey.** É o braço de uma empresa terceira rodando aqui dentro.
  Tudo que ele lê, a empresa dela lê. Ele é Grau 33 com pernas.

O propósito do produto é impedir o **erro humano do próprio dono**: colar, anexar ou deixar o
agente topar com dado de cliente e isso chegar à Anthropic, à xAI ou a quem for. Não é esconder
nada de ninguém que tenha direito de ver, nem contornar a LGPD — é o contrário: é a prevenção
técnica de um vazamento que hoje depende de o desenvolvedor lembrar, toda vez.

Toda a decisão abaixo decorre disto: **visão total para o Donkey, visão mediada para o CLI.**

## Decisão

### Parte 1 — autenticação (vale desde já)

1. O Donkey **nunca** lê, copia ou reusa credencial de outro aplicativo: nada de `~/.claude`,
   `~/.codex/auth.json`, `~/.gemini`, cofre do Cursor. Isso fere `dominio/REGRAS.md §4` e é
   tratado como violação de segurança, não como atalho de engenharia.
2. Não existe "login único" entre provedores no Donkey. Cada provedor continua com o seu caminho:
   chave no cofre (ADR-004) **ou** delegação ao CLI (parte 2).
3. O login do Google do usuário não é credencial de provedor em lugar nenhum do produto.

### Parte 2 — execução delegada (depende do "sim" do humano)

4. Um executor nativo roda o CLI escolhido como **subprocesso**, no modo não interativo, e usa
   a sessão que o próprio CLI mantém. O Donkey não vê, não guarda e não transporta esse token.
5. A lista de CLIs executáveis é **fixa no código**, como já é a lista de shells do terminal.
   Nada de caminho de executável digitado pelo usuário. A primeira versão traz **só o `ollama`**;
   cada CLI novo entra por decisão registrada, com as travas de contenção já cobertas por teste.
6. O prompt só chega ao CLI depois de passar pelo `harness-gate`. Veredito diferente de `safe`
   exige "auditar solicitação" antes de o subprocesso nascer.
7. A saída estruturada do CLI (no Claude Code, `--output-format stream-json --verbose`) é a fonte
   da linha do tempo de rastreio na interface. O PTY continua sendo terminal, não fonte de dado.

### Parte 3 — MCP (já implementado no cartão 2)

8. O Donkey publica `packages/mcp-harness` como **servidor MCP**, para que qualquer CLI chame o
   mesmo filtro. A resposta nunca devolve o trecho sensível original.
9. O Donkey como **cliente** de MCPs de terceiros fica fora desta ADR.

## Alternativas consideradas

| Alternativa | Por que não |
| --- | --- |
| Reusar o login do Google entre as ferramentas | Tecnicamente impossível: o token é do fornecedor, não do Google. |
| Ler a credencial que o CLI guardou e chamar a API com ela | Fere `REGRAS.md §4`; é credencial de outro aplicativo, provavelmente contra os termos. |
| Só API key, como hoje | Mantido como caminho válido, mas cobra de novo e não dá agente nem rastreio. |
| Automatizar a interface web do fornecedor | Frágil, quebra a cada mudança de tela e esbarra em bot detection. |
| Pedir ao usuário que copie e cole no CLI | É o que ele já faz; o produto não acrescenta nada. |

## O risco que ninguém pode varrer para baixo do tapete

**Delegar ao CLI reabre, pelo lado de dentro, o vazamento que o Harness fecha pelo lado de fora.**

O `harness-gate` controla o *prompt*. O CLI, uma vez rodando, tem ferramentas próprias: ele lê
arquivos do disco, roda comandos e manda o que achar para o fornecedor — sem passar pelo filtro.
Um prompt impecavelmente redigido não impede o agente de abrir o `.env` do projeto no passo
seguinte e mandar o conteúdo para o Grau 33.

### Contenção decidida pelo humano em 2026-11-13

**Raiz restrita + contenção de ferramentas**, as duas juntas, requisito da parte 2:

1. **Raiz restrita.** O subprocesso nasce num diretório de trabalho dedicado. O workspace real
   não fica visível ao CLI delegado.
2. **Ferramentas por lista de permissão.** O executor declara o que o CLI pode usar; o que não
   estiver na lista não roda. As ferramentas **nativas** de leitura de disco, rede e shell do CLI
   ficam fora por padrão.

Sem as duas, a parte 2 **contradiz a missão** e não deve ser implementada. QA e Security tratam
regressão nessas duas travas como achado de severidade alta, no mesmo nível dos detectores.

### Acesso mediado: a contenção não cega o agente

A objeção óbvia à raiz restrita é que o agente fica inútil sem enxergar o projeto. O modelo de
confiança resolve isso sem afrouxar nada: **quem enxerga o disco é o Donkey, e o agente pede a
ele.**

O servidor MCP da parte 3 ganha ferramentas de acesso ao workspace — `listar_arquivos`,
`ler_arquivo`, `buscar_no_projeto`. Elas rodam **no Donkey**, com visão total, e devolvem ao
agente o conteúdo **já auditado pelo Harness**: redigido, resumido ou sintetizado conforme o
veredito. O CLI delegado então:

- tem as ferramentas nativas de arquivo **negadas**;
- recebe as ferramentas do `donkey-harness` como **única** porta para o projeto;
- continua explorando o código por conta própria, que é o que o torna bom — só que cada arquivo
  que ele vê passou pelo filtro.

Assim a trava deixa de ser preço e vira mecanismo: o agente não é cegado, é **intermediado**.
Esse é o "meio de campo" da `MISSAO.md` aplicado à execução, e não só ao prompt.

Consequência honesta: a qualidade do que o agente produz passa a depender da qualidade da
redação e da síntese. Enquanto `sintetizar_dados` for molde fixo, arquivo com muito dado real
chega pobre ao agente. É mais um motivo para o cartão 4 (síntese de verdade) vir cedo.

Refinamentos previstos, fora do mínimo acima:

- registrar no rastreio cada arquivo que o agente pediu e o veredito de cada um;
- cache do veredito por arquivo, para não reauditar o mesmo conteúdo a cada passo.

## O que depende de você (humano)

1. ~~**Risco contratual.**~~ — **decidido em 2026-11-13:** uso pessoal, na máquina do próprio dono,
   com a assinatura dele, e o executável **não é compartilhado**. O risco é aceito nesse escopo.
   Distribuição a terceiros reabre a questão e exige decisão nova.
2. ~~**Nível de contenção** do subprocesso.~~ — **decidido em 2026-11-13: raiz restrita + lista de
   permissão de ferramentas**, com acesso ao projeto mediado pelo MCP do Donkey.
3. ~~**Quais CLIs** entram na lista fixa da primeira versão.~~ — **decidido em 2026-11-13:
   `ollama` primeiro, sozinho.** Perímetro local: o executor, a contenção e o rastreio nascem e
   são validados sem um byte sair da máquina. Os demais (`claude`, `gemini`, `codex`) ficam
   previstos no contrato do executor, mas **não implementados** até o caminho do Ollama estar
   fechado e testado. Nenhum deles entra sem que as duas travas da seção de contenção estejam
   ativas e cobertas por teste.

## Consequências

- O executor e o leitor de `stream-json` nascem em `src/application/`, com adapter em `src-tauri/`;
  o formato de evento de cada CLI é instável e fica isolado num tradutor por fornecedor.
- A interface ganha uma linha do tempo de execução alimentada por eventos, não por texto de terminal.
- O custo por token some para quem usa assinatura; o monitor de gastos passa a ter execuções sem
  custo apurável, e isso precisa aparecer como "coberto por assinatura", não como "US$ 0,00".
- Falta de CLI instalado vira estado previsto da interface, não exceção.
- `dominio/REGRAS.md` ganha um item: **o Donkey não reusa credencial de outro aplicativo**.
- O servidor MCP deixa de ser só auditoria e passa a ser **a porta do agente para o projeto**:
  o cartão 3 depende de ferramentas de workspace no `packages/mcp-harness`.
- Escopo de uso pessoal registrado: nada aqui autoriza distribuir o executor a terceiros.
