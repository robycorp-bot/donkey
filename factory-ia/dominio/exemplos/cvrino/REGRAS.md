# Regras — CVRINO (exemplo)

1. `ApiKernel` não contém regra de negócio, validação nem SQL.
2. SQL só com prepared statements. Proibido concatenar entrada em SQL.
3. CSP sem inline: nenhum `style=""`, `<style>`, `onclick=""`, `<script>` inline.
4. Papéis `dev` / `admin` / `user`. Toda rota declara papel, módulo e cliente.
5. Escritas exigem CSRF; em produção só `APP_ORIGIN`.
6. Erro público sem detalhe; detalhe no log com `errorId`.
7. Segredos em `gade/config.local.php` (fora do Git) ou cofre (`SecretBox`).
8. Ferramentas `/api/dev-scripts` só em ambiente local.
9. Dado fiscal/bancário/CPF: mínimo necessário, nunca em exemplo de spec/Git.

**Proibido sem ADR + CTO + humano:** novo framework JS, Node no host, abrir Swagger
em produção, Docker em produção.

**Falhas públicas:** mensagem acionável em português + `errorId`. Sem stack, SQL ou caminho.
