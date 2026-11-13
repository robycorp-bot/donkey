# Git e deploy deste projeto

Complementa o núcleo (push/PR/merge/produção só com "sim" do humano).

**Branch principal:** `main`

**Nunca entra no Git:** `.env`, `config.local.*`, `*.pem`, `*.key`, chaves de API, dumps com PII, `src-tauri/target/` (artefato de build).

**Convenção de commit:** Imperativo, curto, português (padrão do núcleo).

**Há deploy?** Não há servidor de produção; há **distribuição** de executável Windows.

**Ambientes:** Local (dev), build de instalador (release pessoal).

**Roteiro de produção (passos):** Backup opcional do instalador anterior → `npm run desktop:build` → testar em máquina limpa → substituir instalação local. Sem auto-update remoto na versão atual.

**Homologação pelo DevOps sem humano extra?** Não se aplica.

**Pacote nunca inclui:** Credenciais, conversas exportadas com PII, workspace do usuário.
