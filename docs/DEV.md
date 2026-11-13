# Desenvolvimento e instalação local

O Donkey é **editor de código completo** (Monaco, workspace, Git, terminal, execução de projetos) **e** meio de campo seguro para IA (Harness / Grau 33). Os comandos abaixo cobrem os dois lados: iterar na UI e gerar o `.exe` instalável.

## Pré-requisitos (Windows)

- **Node.js** ≥ 22.12 (`node -v`)
- **Rust** + MSVC (para `tauri build`)
- **WebView2** (já vem no Windows 11 recente)
- **Git** (painel Git do app)

## Primeira vez no clone

```powershell
cd C:\Users\lucas\Documents\Dev\Eus\donkey
npm run setup
```

Instala dependências da raiz e do pacote `packages/harness`.

## Dia a dia — só desenvolver

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Interface no navegador (Vite, sem disco nativo completo) |
| **`npm run dev:app`** | **App desktop com hot reload** (Tauri + Svelte) — use este |
| `npm run test` | Testes unitários do editor |
| `npm run test:harness` | Testes do meio de campo LGPD |
| `npm run check` | Typecheck Svelte/TS |

## Compilar e instalar no Windows

| Comando | O que faz |
| --- | --- |
| **`npm run ship`** | Build release + desinstala versão antiga + instala + abre o app. Se o NSIS for bloqueado, copia o `.exe` |
| `npm run ship:portable` | O mesmo build, mas só copia o `.exe` (`-Portable`), sem passar pelo setup |
| `npm run build:app` | Só gera o instalador (NSIS em `src-tauri\target\release\bundle\nsis`) |
| `npm run install:app` | Reinstala o último instalador **sem** recompilar (`-SkipBuild`) |

Equivalente PowerShell:

```powershell
.\scripts\reinstall.ps1              # build + instalar + abrir
.\scripts\reinstall.ps1 -SkipBuild   # só reinstalar
.\scripts\reinstall.ps1 -NoLaunch    # sem abrir no fim
.\scripts\reinstall.ps1 -Portable    # copia donkey.exe, sem NSIS
```

Se não houver entrada registrada ou `uninstall.exe`, a desinstalação é ignorada. Se o Windows Smart App Control bloquear o setup ou o desinstalador, o script copia `donkey.exe` para `%LOCALAPPDATA%\Donkey` e garante o atalho do Menu Iniciar.

## Verificação antes de entregar

```powershell
npm run verify
```

Roda check, testes, testes Rust, build web e e2e (mais lento).

## Onde fica o executável

Após `npm run build:app` ou `ship`:

- Instalador: `src-tauri\target\release\bundle\nsis\Donkey_*_x64-setup.exe`
- Binário (NSIS): pasta de instalação do usuário (menu Iniciar → **Donkey**)
- Binário (portátil, se o setup for bloqueado): `%LOCALAPPDATA%\Donkey\donkey.exe`

Detalhes de uso do editor: [`PRIMEIRO_TESTE.md`](PRIMEIRO_TESTE.md).
