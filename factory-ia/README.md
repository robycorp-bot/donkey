# factory-ia — núcleo da fábrica de software

Isto **não** é um produto. É o sistema operacional da equipe de IA: papéis, fluxo,
paralelismo, qualidade e governança. Serve para qualquer projeto-filho (web, CLI, API,
dados, automação). Código de aplicação é output do projeto-filho, não desta pasta.

O que muda em cada projeto fica em [`dominio/`](dominio/). **Não** coloque stack,
missão ou regras de negócio no restante de `factory-ia/`.

## Leitura obrigatória (nessa ordem)

| Quando | Arquivo |
|---|---|
| Sempre, antes de agir | [AGENTS.md](AGENTS.md) |
| Demanda nova, plano, subagentes | [PARALELO.md](PARALELO.md) |
| Assumir um papel | [personas/](personas/) da ficha + [config/modelos.yaml](config/modelos.yaml) |
| Entender o *porquê* | [VISAO.md](VISAO.md) |
| Plugar Claude, Gemini, Codex, Grok, Cursor | [ADAPTADORES.md](ADAPTADORES.md) |
| Copiar esta base para um repo novo | [COPIAR.md](COPIAR.md) e [dominio/CHECKLIST-PRIMEIRO-DIA.md](dominio/CHECKLIST-PRIMEIRO-DIA.md) |

## Mapa

```text
factory-ia/                 NÚCLEO (estável, igual em todo projeto)
  AGENTS.md                 como trabalhar — fonte de processo
  PARALELO.md               quando paralelizar, conflitos, fusão
  VISAO.md                  organização e modos de orquestração
  ADAPTADORES.md            como cada ferramenta carrega as regras
  COPIAR.md                 como copiar a base
  config/modelos.yaml       nível rápido/padrão/profundo × fornecedor
  personas/                 contratos dos papéis da fábrica
  mcp/                      como expor ferramentas MCP (genérico)
  hooks/                    ganchos opcionais (git, etc.)
  skills/                   skills de PROCESSO (não de negócio)
  dominio/                  SLOT DO PROJETO (único lugar que muda)
    MISSAO.md STACK.md REGRAS.md GLOSSARIO.md GIT-E-DEPLOY.md PERSONAS.md
    personas/               personas extras só deste projeto
    exemplos/               referências opcionais (não estão ativas)
```

## Princípios

1. **Uma fonte de verdade.** Regras de processo vivem só aqui (fora de `dominio/`).
   Arquivos de ferramenta (`CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `GROK.md`, `.cursor/`,
   `.claude/`) só apontam.
2. **Nível, não nome de modelo.** Personas pedem `rapido` | `padrao` | `profundo`.
3. **Domínio no slot.** Missão, stack, regras invioláveis e glossário ficam em `dominio/`.
4. **Independência com contrato.** Cada persona tem entrada, saída, vetos e o que não faz.
5. **Paralelo por padrão quando for seguro.** O CTO decide; o protocolo está em PARALELO.md.
6. **O humano autoriza o irreversível.** Push, PR, merge, produção e segredos exigem "sim".
