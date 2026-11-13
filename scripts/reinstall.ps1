[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoLaunch,
  [switch]$KeepInstaller
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundleDirectory = Join-Path $projectRoot 'src-tauri\target\release\bundle\nsis'

# "Coder mega-brain" é o nome antigo do app: ele é removido para não ficar duas cópias instaladas.
$currentName = 'Donkey'
$legacyNames = @('Coder mega-brain')
$processNames = @('donkey', 'coder-mega-brain')

function Stop-InstalledApp {
  $processes = Get-Process -Name $processNames -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    Write-Host "Fechando $($process.ProcessName) (PID $($process.Id))..."
    $process.CloseMainWindow() | Out-Null
    if (-not $process.WaitForExit(5000)) { Stop-Process -Id $process.Id -Force }
  }
}

function Get-InstalledEntries([string[]]$Names) {
  Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $Names -contains $_.DisplayName }
}

function Remove-Installed($entry) {
  $location = ([string]$entry.InstallLocation).Trim('"')
  $uninstaller = Join-Path $location 'uninstall.exe'
  if (Test-Path -LiteralPath $uninstaller) {
    Write-Host "Removendo $($entry.DisplayName) $($entry.DisplayVersion)..."
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($uninstall.ExitCode -ne 0) { throw "A desinstalação de $($entry.DisplayName) falhou (código $($uninstall.ExitCode))." }
  }
}

Push-Location $projectRoot
try {
  if (-not $SkipBuild) {
    Write-Host 'Gerando o build de produção...'
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'O build falhou; a instalação atual foi preservada.' }
  }

  $installer = (Get-ChildItem -LiteralPath $bundleDirectory -Filter "${currentName}_*_x64-setup.exe" -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  if (-not $installer) { throw "Instalador não encontrado em: $bundleDirectory" }

  Stop-InstalledApp
  foreach ($entry in @(Get-InstalledEntries ($legacyNames + $currentName))) { Remove-Installed $entry }

  Write-Host 'Instalando a nova versão...'
  $install = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  if ($install.ExitCode -ne 0) { throw "A instalação falhou (código $($install.ExitCode))." }

  $entry = Get-InstalledEntries @($currentName) | Select-Object -First 1
  if (-not $entry) { throw 'A instalação terminou, mas não foi registrada no Windows.' }
  Write-Host "Instalado: $($entry.DisplayName) $($entry.DisplayVersion) em $(([string]$entry.InstallLocation).Trim('"'))"

  if (-not $NoLaunch) {
    $location = ([string]$entry.InstallLocation).Trim('"')
    Start-Process -FilePath (Join-Path $location 'donkey.exe')
  }
  if (-not $KeepInstaller) { Write-Host "Instalador preservado em: $installer" }
}
finally {
  Pop-Location
}
