# @donkey/mcp-harness

Servidor **MCP** que expõe o Harness do Donkey a qualquer CLI de IA (Claude Code, Gemini CLI,
Codex, Cursor). Serve para que a regra de **Grau 33** valha também fora da interface do Donkey.

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `auditar_texto` | Veredito (`safe` / `needs_review` / `blocked`), achados por tipo e posição, e o texto já redigido. |
| `sintetizar_dados` | Exemplo fictício com a forma pedida (XML, JSON, texto). Molde fixo nesta versão. |
| `listar_arquivos` | Conteúdo de uma pasta do projeto; segredo aparece marcado como bloqueado. |
| `ler_arquivo` | Arquivo de texto **já auditado**: trecho sensível vem como marcador. |
| `buscar_no_projeto` | Caminho, linha e trecho auditado de cada ocorrência de um termo. |
| `status_grau33` | A política em si e se um destino está fora do perímetro local. |

**A resposta nunca devolve o trecho sensível original.** Quem chama é um CLI de terceiro — ou seja,
Grau 33. Vão só tipo, severidade, posição e o texto redigido.

## Instalar

```bash
npm run mcp:build
```

O `dist/` é ignorado pelo Git, então todo clone novo precisa desse passo antes de usar o servidor.
A configuração de projeto do Claude Code já está em `.mcp.json`, na raiz do repositório.

Para as outras ferramentas, o comando é o mesmo (`node packages/mcp-harness/dist/server.mjs`);
muda só onde a configuração mora — `.gemini/settings.json`, `~/.codex/config.toml`, e assim por
diante. Confira o formato na documentação da versão que você usa antes de colar.

## Acesso ao projeto: a porta é esta, e só esta

`listar_arquivos`, `ler_arquivo` e `buscar_no_projeto` existem para que o agente **não precise**
das próprias ferramentas de disco (ADR-007). Quem enxerga o projeto é o Donkey; o agente pede,
e recebe conteúdo auditado. Ao delegar execução a um CLI, negue as ferramentas nativas de arquivo
dele e deixe só estas.

Três travas, nesta ordem:

1. **Caminho preso à raiz.** Relativo sempre; `..` é recusado; link simbólico que aponta para fora
   é recusado mesmo existindo dentro.
2. **Segredo não se lê.** `.env`, `config.local.*`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, `.netrc`,
   qualquer coisa sob `.git/` — recusado antes de abrir o arquivo. Não é redigido: é negado.
   Na listagem aparece como `bloqueado`, para o agente saber que existe e não insistir.
3. **O resto passa pelo Harness.** Inclusive o nome do arquivo, que também pode carregar PII.

Binário e arquivo acima de 2 MiB não são entregues. A raiz vem de `DONKEY_WORKSPACE` ou, na falta
dela, do diretório onde o processo subiu.

Na leitura de arquivo a redação é aplicada **em tamanho cheio**, sem o resumo do Harness — resumir
cortaria código no meio. Por isso as posições dos achados não voltam na resposta, só a contagem
por tipo: depois da redação elas não corresponderiam mais ao texto entregue.

## O que este servidor NÃO faz

Ele não protege o que você já digitou dentro do CLI. Quando o texto chega ao `claude` no terminal,
ele **já cruzou** para o Grau 33 — o modelo leu. O que o servidor dá é:

1. uma definição única de dado sensível para toda a fábrica, em vez de uma por ferramenta;
2. a chance de o agente sanitizar **antes** de escrever num arquivo, abrir um PR ou chamar outro serviço;
3. o mesmo veredito que a interface do Donkey usa, sem duplicar detector;
4. com as ferramentas de workspace, um caminho auditado para o agente ler o projeto — desde que
   as ferramentas nativas de arquivo dele estejam negadas. **Se elas continuarem ligadas, este
   servidor não impede nada**: o agente lê direto e manda para o fornecedor.

A proteção na entrada continua sendo o caminho do próprio Donkey:
chat → `src/application/harness-gate.ts` → auditar solicitação → provedor.

## Protocolo

JSON-RPC 2.0 sobre stdio, uma mensagem por linha, **sem dependência externa**. Implementa
`initialize`, `notifications/initialized`, `ping`, `tools/list` e `tools/call`.
O `stdout` é do protocolo e de mais nada; log vai para o `stderr`.

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp-harness/dist/server.mjs
```
