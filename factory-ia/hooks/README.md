# Hooks (opcional)

O núcleo não instala hook sozinho. O projeto-filho decide.

## Git

Sugestão: `pre-commit` que **bloqueia** (não corrige) se o index tiver
`.env`, `config.local.*`, `*.pem`, `*.key` ou arquivos listados em
`factory-ia/dominio/GIT-E-DEPLOY.md`.

O hook NÃO substitui o Git Agent nem o "sim" do humano. Só evita o erro óbvio.

Não versionar hook que rode deploy ou push.

## Ferramentas (Cursor, Claude)

Não coloque prompt de persona em hook. Persona vive em `factory-ia/personas/`.
Hook de ferramenta, se existir, só dispara “leia AGENTS.md” ou um lint já acordado
no domínio.
