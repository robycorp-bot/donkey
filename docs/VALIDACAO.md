# Validação da versão pessoal 0.2.0

Data: 2026-10-19. Ambiente: Windows, Node 24, Rust 1.99, WebView2.

## Verificações automatizadas

- `npm run check`: nenhum erro ou aviso.
- `npm test`: 25 testes aprovados.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 16 testes aprovados.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`: aprovado.
- `npm run desktop:build`: executável otimizado e instalador NSIS x64 gerados.

O build mantém os chunks maiores do Monaco separados, carregados quando um arquivo é aberto. O aviso de tamanho desses chunks não impede o build.

## Aplicativo nativo

Teste opt-in no WebView2 de produção, usando somente pastas descartáveis e remoto bare local:

- Abrir projeto por argumento e restaurar a árvore na interface.
- Ler e salvar arquivo no disco.
- Preparar arquivo e criar commit real.
- Criar/trocar branch e fazer push em remoto local.
- Servir HTML em loopback; bloquear acesso HTTP a `.env`; parar o servidor.
- Executar script npm, capturar logs e observar saída 0.
- Mostrar o histórico real no painel Git.

Os testes Rust também conferem retirada do índice sem apagar o arquivo, fetch/pull em remoto local, conflito de gravação, junções, arquivos somente leitura, binários e limites. Nenhum push foi realizado para o GitHub do usuário.

O teste é repetível com `scripts/test-native.ps1`. A depuração WebView2 é habilitada somente no processo de teste e as variáveis são restauradas ao iniciá-lo. O artefato final não habilita uma porta de depuração por padrão.

## Interface e prévia web

Tabbit conferiu os painéis Git/execução e a identificação de recursos exclusivos do app instalado. A validação anterior cobriu edição, salvamento em memória, preservação de desfazer entre abas, filtro, proteção de alterações não salvas e dimensões mínimas de 1000×680.

A captura do aplicativo nativo está em `artifacts/native-ui.png` e o relatório funcional em `artifacts/native-smoke.json`. Esses artefatos locais são ignorados pelo Git.

## Limites

Instalador NSIS executado com sucesso (código 0), registro de desinstalação HKCU na versão 0.2.0 e atalho no menu Iniciar confirmados. A cópia instalada em `%LOCALAPPDATA%\Coder mega-brain` passou os 11 fluxos do teste nativo, incluindo prévia HTML incorporada em iframe separado do WebView2 e retorno ao editor. Não há homologação em uma imagem Windows limpa. Autenticação em GitHub privado usa o Git existente e ainda depende da conta/configuração do usuário. APIs de IA não receberam credenciais reais neste teste. Docker, terminal interativo e Copilot SDK permanecem pendentes.

O instalador pessoal não recebe assinatura de código comercial. Não há publicação automática, telemetria própria nem envio automático de projetos aos chats.