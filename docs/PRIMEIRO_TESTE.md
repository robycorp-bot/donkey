# Primeiro teste pessoal — 0.2.0

## Instalar e abrir

A versão 0.2.0 já foi instalada nesta máquina. Para reinstalar, execute o instalador local `artifacts/Coder-mega-brain-0.2.0-setup.exe`. A instalação é por usuário, sem exigir uma conta no editor. O app aparece no menu Iniciar como **Coder mega-brain**.

Para editar arquivos e usar o servidor HTML, o WebView2 do Windows é suficiente. Para Git, tenha Git instalado. Para executar scripts de projetos JavaScript, tenha Node.js com npm instalado. Reabra o editor depois de instalar ferramentas para atualizar o PATH.

O projeto é pessoal. O código não é publicado nem enviado ao GitHub automaticamente. Configure o repositório como privado no próprio GitHub; a aplicação não altera sua visibilidade.

## Reinstalar depois de uma atualização

Depois de alterar o código, execute na raiz:

```powershell
.\scripts\reinstall.ps1
```

O fluxo roda o build de produção, fecha a cópia aberta, desinstala a versão registrada no Windows, instala o instalador mais recente e abre o aplicativo. Para apenas reinstalar o último instalador sem compilar, use `.\scripts\reinstall.ps1 -SkipBuild`; para deixar o aplicativo fechado, acrescente `-NoLaunch`.

## Abrir um projeto

Clique no nome do projeto no topo ou no botão de pasta em **Projetos**. Selecione a pasta raiz. Navegue, abra um arquivo e salve com **Ctrl S**. O editor preserva alterações em abas e detecta conflitos com mudanças feitas por outro editor.

Também é possível iniciar por linha de comando: `coder-mega-brain.exe "C:\caminho\do\projeto"`.

## Fazer commit e enviar

1. Abra **Git** na barra inferior ou o ícone de branches no topo.
2. Se a pasta ainda não tiver Git, use **Inicializar Git nesta pasta**.
3. Clique em **+** junto aos arquivos que deseja preparar. Revise a lista de preparados.
4. Escreva a mensagem e clique em **Criar commit**. O commit inclui somente o que já está preparado no índice Git.
5. Use **Enviar** para publicar a branch em `origin`. O Git deve ter um remoto origin e autenticação válidos. A aplicação usa Git Credential Manager/SSH existentes; não guarda sua senha do GitHub.

O painel também cria e troca branches, busca alterações e atualiza com fast-forward. A troca de branch/atualização exige salvar ou fechar abas alteradas. Não existe push forçado nem descarte de arquivos pelo painel.

Se o Git pedir sua identidade, configure uma vez pelo terminal do sistema:

```powershell
git config --global user.name "Seu nome"
git config --global user.email "Seu e-mail de commits"
```

Configurar `origin` ou clonar um repositório ainda é feito pelo Git/GitHub CLI no terminal do sistema. Abra no editor a pasta já clonada.

## Visualizar HTML simples

1. Abra uma pasta com `index.html` na raiz.
2. Clique em **Executar** → **Servidor HTML**.
3. Use **Ver no editor** ou **Abrir no navegador**.

O servidor escuta somente em `127.0.0.1`, escolhe uma porta disponível e não serve arquivos ocultos, como `.env` e `.git`. Salvar pelo editor atualiza a prévia incorporada; mudanças externas podem ser conferidas pelo botão de atualizar. O servidor estático não transpila TypeScript nem substitui o build de frameworks.

## Executar React, Svelte, Vite e outros projetos npm

1. Abra a pasta que contém `package.json`.
2. Abra **Executar**. Se necessário, use **Instalar dependências · npm install** e aguarde os logs.
3. Escolha o script correto, como `dev`, e clique em **Executar script**.
4. O endereço local impresso pelos servidores comuns aparece no campo de prévia. Caso necessário, informe manualmente `http://localhost:PORTA`.
5. Clique em **Ver no editor**. Se o projeto impedir incorporação, use o navegador externo.
6. Use **Parar** para encerrar a execução. Trocar de projeto ou fechar o app encerra a execução gerenciada.

O editor roda os scripts definidos pelo projeto; por isso, cada projeto mantém seus requisitos próprios. Esta versão usa npm, permite uma execução gerenciada por vez e mostra até 350 linhas recentes de saída. Terminal interativo completo e suporte dedicado a outros gerenciadores ficam para outra etapa.

## Assistentes de IA

Configure cada chave no painel de IA do aplicativo instalado. Arquivos abertos não são anexados automaticamente. Copilot continua reservado para integração posterior. Os chats usam APIs, sem executar agentes sobre seus arquivos nesta versão.
