# ADR 0001 — Swagger / OpenAPI (só infraestrutura, só ambiente local)

> Exemplo de ADR de um produto antigo. **Não** é regra desta BASE. Só vale se o
> domínio vivo for o CVRINO.

- **Status:** proposta revisada (rev. 2), aguarda aprovação do CTO. Substitui a rev. 1, que
  previa acesso em produção por flag + sessão + papel dev; esse caminho foi **removido** por
  decisão do humano.
- **Autor:** Architect · **Demanda:** classe F, aprovada pelo humano
- **Escopo:** spec OpenAPI e Swagger UI **apenas no ambiente local de desenvolvimento**.
  Esta ADR **não** decide quais rotas são documentadas (ver "Fora do escopo").

## Duas decisões do humano, separadas

| | Tipo | Quem decide | Onde fica registrada |
|---|---|---|---|
| **A** | **ARQUITETURA DE SEGURANÇA** | Humano (registrada pela arquitetura) | **Esta ADR** |
| **B** | **NEGÓCIO** | Humano / Product | Fora desta ADR (história do Product) |

**A) Decisão de ARQUITETURA DE SEGURANÇA.** A Swagger UI (`/api-docs`) e o spec OpenAPI
(`/api/docs/openapi.json`) **NÃO ficam expostos em produção, em nenhuma hipótese**: sem flag
que os abra em produção, sem exceção para usuário dev logado, sem chave de API. Só existem no
ambiente local de desenvolvimento.

**B) Decisão de NEGÓCIO (fora do escopo desta ADR técnica).** **Quais rotas** entram no spec é
escolha do negócio/Product, não da arquitetura. Propósito inicial informado pelo humano: documentar
as rotas que **outro app da mesma empresa** vai consumir para obter dados. Esta ADR só garante que,
seja qual for a escolha, o spec e a UI não saem do ambiente local.

> **Não confundir "documentar a rota" com "mostrar o Swagger".** Documentar uma rota no spec
> (B) não a expõe a ninguém. Expor essas rotas **em produção para o outro app** (autenticação
> máquina-a-máquina, escopo de dados por cliente, LGPD, rate limit, auditoria) é **demanda futura,
> com ADR própria**. Nem o spec nem a Swagger UI fazem parte dessa entrega futura em produção.

## Contexto

Front controller `public_html/index.php` com CSP estrita (`script-src 'self'; style-src 'self'`,
sem `unsafe-inline`), assets servidos só por lista branca em `webAssets()`, `ApiKernel` que só
roteia. `Environment::isLocal()` é verdadeiro só com `APP_ENV` em `local|development|testing`
(falha fechado). Hostinger Single: sem Node, deploy por ZIP (`deploy-hostinger/pack.php`).
O padrão já existente para ferramenta só-local é `/api/dev-scripts`: `isLocal()` **e**
`ENABLE_DEV_SCRIPTS === '1'`, senão 404; e a pasta `dev-scripts` não entra no ZIP.

Risco apontado pelo Security (médio): se `APP_ENV` for configurado errado em produção
(ex.: `config.local.php` copiado do ambiente local), `isLocal()` vira verdadeiro e a
documentação abriria sem login.

## Decisão

1. **Spec:** OpenAPI **3.1.0 em JSON**, estático em `gade/openapi/openapi.json`
   (`paths: {}` até o Product definir as rotas). Fora da raiz web; servido por
   `GET /api/docs/openapi.json` (`application/json; charset=utf-8`, `no-store`).
2. **Swagger UI sem inline:** `swagger-ui-dist` 5.x pinado, vendorizado em
   `gade/app/assets/vendor/swagger-ui/` (`swagger-ui-bundle.js`, `swagger-ui.css`, `LICENSE`,
   `VERSION`). Página própria `gade/app/api-docs.html` + `gade/app/assets/scripts/api-docs.js`
   com `SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui',
   validatorUrl: null, layout: 'BaseLayout', queryConfigEnabled: false })`. A CSP não muda.
3. **Acesso — regra única, só local, com dupla trava:**
   - `App\Security\ApiDocsAccess` fica com **um** método: `enabled(): bool` =
     `Environment::isLocal() && getenv('SWAGGER_ENABLED') === '1'`.
     Mesmo padrão de `ENABLE_DEV_SCRIPTS`. **Recomendado e adotado:** a flag explícita em local
     mitiga o `APP_ENV` mal configurado (para abrir em produção seriam precisos **dois** erros
     de configuração **e** os arquivos terem subido, o que o item 4 impede).
   - Bloco em `public_html/index.php`, antes do `ApiKernel`, para `/api-docs` e `/api/docs/*`:
     se `$bootstrapError !== null` **ou** `!ApiDocsAccess::enabled()` **ou** caminho fora de
     `['/api-docs', '/api/docs/openapi.json']` → **404 vazio, para qualquer método**, sem abrir
     banco nem sessão. Depois de liberado: só `GET`/`HEAD` (outros: 405).
   - **Removido** (não implementar): flag que libera em produção, `enabledInProduction()`,
     `allowsPage()/allowsSpec()`, consulta a `AuthService`/sessão, `Roles::isDev`,
     `validApiKey`, `requestInterceptor` com `X-Api-Key-User`.
   - `api-docs.js` **não** busca `/api/auth/me` nem guarda chave de API: em local não há
     autenticação para a doc. (Quando houver "Try it out" contra rotas reais, o envio de
     credencial/CSRF é decidido na ADR das rotas, não aqui.)
   - `ApiDocsController` perde `$current`/`$validApiKey` e a checagem própria; recebe só os
     caminhos dos arquivos (o acesso já foi decidido no `index.php`).
   - Sem `AccessPolicy`/`ModuleAccess`: não é rota de módulo e não existe fora de local.
4. **Defesa em profundidade no deploy — o que não sobe não vaza.**
   - `pack.php` **exclui do ZIP**: `gade/app/api-docs.html`, `gade/app/assets/scripts/api-docs.js`,
     `gade/app/assets/vendor/swagger-ui/` (pasta inteira) e `gade/openapi/` (pasta inteira),
     por caminho relativo exato (não por nome solto). Também não sobe
     `deploy-hostinger/fetch-swagger-ui.php` (já fica fora: `pack.php` só leva `public_html/` e `gade/`).
   - `webAssets()` passa a receber `bool $isLocal`: a pasta `vendor/swagger-ui` só entra na lista
     em local, e `/assets/scripts/api-docs.js` é removido da lista fora de local. Assim, mesmo que
     um arquivo suba por FTP manual, produção responde 404.
5. **`gade/bin/check-hosting.php` (produção = `!isLocal()`):**
   - **Falha (check `false`, exit 1):** existir no servidor qualquer um de `gade/app/api-docs.html`,
     `gade/app/assets/scripts/api-docs.js`, `gade/app/assets/vendor/swagger-ui/`,
     `gade/openapi/`. Isso indica pacote errado ou upload manual — é o alerta forte.
   - **Aviso (mantém nível, muda o texto):** `SWAGGER_ENABLED=1` fora de local. A flag é
     inoperante em produção, mas sinaliza `config.local.php` copiado do ambiente local.
     Texto sugerido: "SWAGGER_ENABLED=1 fora do ambiente local: a flag não tem efeito em
     produção, mas indica config copiada do ambiente local. Remova."
6. **Obtenção dos arquivos:** sem mudança — commit no repositório, atualização só por
   `deploy-hostinger/fetch-swagger-ui.php` com sha512 pinado, falha fechado.

## Arquivos a alterar

**Backend**
- `gade/src/Security/ApiDocsAccess.php` — substituir tudo por `enabled()` (isLocal + flag).
- `gade/src/Http/Controllers/ApiDocsController.php` — remover `$current`, `$validApiKey`,
  `requireAccess`; manter `page()`/`spec()`/`send()`.
- `public_html/index.php` — simplificar o bloco `/api-docs` (404 se `!enabled()`, sem banco/sessão);
  `webAssets($webRoot, $isLocal)` com `vendor/swagger-ui` e `scripts/api-docs.js` só em local.
- `gade/app/assets/scripts/api-docs.js` — remover `loadApiKey()`, `/api/auth/me` e `requestInterceptor`.
- `gade/config.example.php` — comentário: "Só ambiente local (APP_ENV=local). Em produção não tem
  efeito." `'SWAGGER_ENABLED' => '0'`.

**DevOps**
- `deploy-hostinger/pack.php` — lista de exclusão por caminho (`$bannedPaths` / prefixos) com os
  quatro itens do item 4; atualizar o docblock "Nunca inclui".
- `gade/bin/check-hosting.php` — falha se os arquivos existirem fora de local; reescrever o aviso
  de `SWAGGER_ENABLED`.

Sem mudança de schema, sem dependência Composer nova, `ApiKernel` não muda.

## Consequências

- (+) Superfície zero em produção: nem rota, nem arquivo, nem flag que abra.
- (+) Regra de acesso trivial de revisar (uma função, duas condições).
- (−) Quem quiser consultar a doc precisa do ambiente local. Aceito pelo humano.
- (−) O outro app da empresa **não** lê o spec em produção; se precisar do contrato, recebe o
  `openapi.json` por outro canal (arquivo versionado/entregue), a decidir na ADR futura.
- Documentação de deploy (`factory-ia/AGENTS.md` §5 "Nunca sobe no pacote") deve citar os quatro
  itens — tarefa do Documentation após aprovação.

## Fora do escopo

- Escolha das rotas documentadas (decisão **B**, Product).
- Exposição de rotas em produção para o outro app (ADR futura: auth máquina-a-máquina, escopo por
  cliente, LGPD, rate limit, logs).

## Riscos

- **CSP x Swagger UI:** QA abre `/api-docs` em local com console aberto e registra violações.
  Proibido `unsafe-inline`.
- **`validatorUrl`** esquecido gera requisição externa bloqueada.
- **Exclusão do pack por nome solto** pode pegar arquivos homônimos; usar caminho relativo exato.
- **LGPD no spec:** exemplos nunca com CPF/CNPJ/dados bancários reais, mesmo sendo só local
  (o arquivo vai para o Git).
- **Limites 120 s / 256 MB:** sem impacto.
