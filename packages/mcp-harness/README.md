# @donkey/mcp-harness

Servidor **MCP** que expõe o Harness do Donkey a qualquer CLI de IA (Claude Code, Gemini CLI,
Codex, Cursor). Serve para que a regra de **Grau 33** valha também fora da interface do Donkey.

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `auditar_texto` | Veredito (`safe` / `needs_review` / `blocked`), achados por tipo e posição, e o texto já redigido. |
| `sintetizar_dados` | Exemplo fictício com a forma pedida (XML, JSON, texto). Molde fixo nesta versão. |
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

## O que este servidor NÃO faz

Ele não protege o que você já digitou dentro do CLI. Quando o texto chega ao `claude` no terminal,
ele **já cruzou** para o Grau 33 — o modelo leu. O que o servidor dá é:

1. uma definição única de dado sensível para toda a fábrica, em vez de uma por ferramenta;
2. a chance de o agente sanitizar **antes** de escrever num arquivo, abrir um PR ou chamar outro serviço;
3. o mesmo veredito que a interface do Donkey usa, sem duplicar detector.

A proteção na entrada continua sendo o caminho do próprio Donkey:
chat → `src/application/harness-gate.ts` → auditar solicitação → provedor.

## Protocolo

JSON-RPC 2.0 sobre stdio, uma mensagem por linha, **sem dependência externa**. Implementa
`initialize`, `notifications/initialized`, `ping`, `tools/list` e `tools/call`.
O `stdout` é do protocolo e de mais nada; log vai para o `stderr`.

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp-harness/dist/server.mjs
```
