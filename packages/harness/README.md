# @donkey/harness

Biblioteca **meio de campo** do Donkey: recebe texto (prompt, trecho de arquivo, histórico) e devolve um veredito + carga segura para envio ao **Grau 33** (LLMs de terceiros).

## Responsabilidades (v0.1 do pacote)

| Etapa | Função |
| --- | --- |
| **Auditar** | Detectar padrões sensíveis (CPF, CNPJ, e-mail, telefone BR, chave NF-e, palavras-chave bancárias). |
| **Redigir** | Substituir trechos por marcadores `[REDACTED:tipo]`. |
| **Resumir** | Stub: futuro hook para modelo **local** em prompts grandes. |
| **Sintetizar** | Stub: gerar variante fictícia preservando forma (XML/JSON). |

## Uso (TypeScript)

```ts
import { runHarness } from '@donkey/harness';

const result = runHarness({
  text: conteudoDoUsuario,
  purpose: 'chat',
});

if (result.verdict === 'blocked') {
  // mostrar UI "auditar solicitação"
}
// result.safeText → enviar ao provedor
```

## Integração com o app

Hoje o pacote é **independente** (`cd packages/harness && npm install && npm test`). Próximo passo: importar em `src/application/` e chamar no comando Rust/TS **antes** do POST ao provedor.

## Princípios

- **Fail-closed:** achado de alta severidade → `blocked` ou `needs_review` (configurável).
- **Não logar** texto original com PII em arquivos.
- Detectores são heurísticos; políticas adicionais ficam em configuração futura.

Ver visão: [`docs/VISAO.md`](../../docs/VISAO.md).
