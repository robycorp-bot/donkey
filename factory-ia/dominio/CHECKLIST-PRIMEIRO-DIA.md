# Checklist — primeiro dia do projeto-filho

Faça nesta ordem. Enquanto houver `[PREENCHER]`, a fábrica não implementa produto.

- [ ] Copiei `factory-ia/` (domínio incluso em `factory-ia/dominio/`, sem ativar `exemplos/`) e os ponteiros da raiz.
- [ ] Abri a ferramenta na **raiz** do repo novo (Claude, Gemini, Codex, Grok ou Cursor).
- [ ] Preenchi `MISSAO.md` (o que é, o que não é, usuários).
- [ ] Preenchi `STACK.md` (linguagem, pastas, comando de teste, host).
- [ ] Preenchi `REGRAS.md` (invioláveis; SQL parametrizado / CSP se couber).
- [ ] Preenchi `GLOSSARIO.md` (termos do negócio).
- [ ] Preenchi `GIT-E-DEPLOY.md` (branch principal, segredos, roteiro de deploy ou “não há deploy”).
- [ ] Preenchi `PERSONAS.md` (extras ou “nenhuma”).
- [ ] Removi todos os `[PREENCHER]` dos arquivos vivos (não mexa em `exemplos/`).
- [ ] Ajustei `.gitignore` à stack (além do da base).
- [ ] Confirmei que `.env`, chaves e `config.local.*` estão ignorados.
- [ ] Li `factory-ia/COPIAR.md`.
- [ ] **Não** editei o núcleo de `factory-ia/` (fora de `dominio/`) para colocar regra de negócio.
- [ ] **Não** apontei adaptadores para um produto antigo.
- [ ] Primeira demanda real: deixar a Triagem classificar; não pular o fluxo.

Exemplo preenchido (painel PHP antigo, só consulta): `exemplos/cvrino/`.
