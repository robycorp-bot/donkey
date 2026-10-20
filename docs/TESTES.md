# Testes e TDD

Toda mudança entra pelo teste: **vermelho → verde → refatorar**.

1. Escreva o teste que descreve o comportamento (ele precisa falhar pelo motivo certo).
2. Escreva o mínimo de código para passar.
3. Refatore com os testes verdes.
4. Bug encontrado vira teste de regressão antes da correção (ex.: `scroll-robustness.test.ts`).

## Camadas

| Camada | Onde | Ferramenta | Comando |
| --- | --- | --- | --- |
| Regras puras (custos, provedores, documentos, validação, formatação) | `src/domain`, `src/application` | Vitest | `npm test` |
| Stores (IA, Git) e ponte nativa | `src/presentation/*-store.test.ts`, `src/infrastructure` | Vitest + mocks | `npm test` |
| Componentes (Central de IA, Monitor, Git, Terminal, Executar, Prévia, App) | `src/presentation/*.test.ts` | Testing Library + jsdom | `npm test` |
| Backend Rust (arquivos, Git, terminal, Live Server, provedores, chaves) | `src-tauri/src/**` (`mod tests`) | `cargo test` | `npm run test:rust` |
| Ponta a ponta com Monaco real | `e2e/` | Playwright | `npm run test:e2e` |

`npm run test:coverage` falha abaixo de 85% de linhas/funções/instruções e 75% de ramos.
`npm run test:all` roda tipos, cobertura, Rust, build e e2e de uma vez.

## Convenções

- Arquivo de teste ao lado do código: `Coisa.svelte` → `Coisa.test.ts`.
- Componentes usam `// @vitest-environment jsdom` e consultam pela acessibilidade
  (`getByRole`, `getByLabelText`), não por classes CSS.
- O Monaco é substituído por `src/test/CodeEditorStub.svelte` nos testes de componente;
  o comportamento real dele é coberto em `e2e/smoke.spec.ts`.
- Nada de rede real: gateway e `tools` são mockados; o Rust testa os parsers com JSON fixo.
- Segurança é testada: chaves nunca vão para o armazenamento, respostas da IA não
  viram HTML, caminhos fora do projeto são recusados, URLs com token são mascaradas.

## Primeira vez

```powershell
npm install
npx playwright install chromium
npm run test:all
```
