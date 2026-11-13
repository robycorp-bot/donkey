# Stack do projeto

**Tipo:** Aplicativo desktop (editor + chat) com backend local; pacote biblioteca **Harness** no monorepo.

**Linguagens / runtime:** TypeScript (Svelte 5 + Vite), Rust (Tauri 2), Node ≥ 22.12 para toolchain.

**Onde está o código:**

| Pasta | Conteúdo |
| --- | --- |
| `src/` | Domínio, aplicação, infraestrutura e UI do Donkey |
| `src-tauri/` | Comandos nativos, filesystem, cofre, HTTP aos provedores |
| `packages/harness/` | Filtro de qualidade e segurança (meio de campo) |
| `docs/` | Visão, arquitetura, roadmap, ADRs |
| `factory-ia/dominio/` | Missão, regras e glossário **deste** produto |

**Banco:** Não há SGBD na versão atual; estado de sessão e persistência futura a definir em ADR.

**UI:** Svelte 5, Monaco, tema enterprise; CSP e sem `innerHTML` com dado externo não sanitizado.

**Teste / lint (comando):**

- Raiz: `npm run check`, `npm run test`, `npm run test:rust`, `npm run test:all`
- Harness: `cd packages/harness && npm test`

**Host / deploy:** Build Windows via `npm run desktop:build`; distribuição pessoal local (ver `docs/ROADMAP.md` fase 5). Detalhe: `GIT-E-DEPLOY.md`.

**Limites:** Arquivos de texto UTF-8 até 2 MiB no fluxo nativo atual; chamadas HTTP com timeout nos adapters Rust.

**Dependências permitidas:** As já no `package.json` / `Cargo.toml`; novas libs no Harness ou app exigem justificativa (peso, rede, licença).
