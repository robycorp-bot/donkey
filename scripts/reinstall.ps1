[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoLaunch,
  [switch]$KeepInstaller
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundleDirectory = Join-Path $projectRoot 'src-tauri\target\release\bundle\nsis'

function Stop-InstalledApp {
  $processes = Get-Process -Name 'coder-mega-brain' -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    Write-Host "Fechando Coder mega-brain (PID $($process.Id))..."
    $process.CloseMainWindow() | Out-Null
    if (-not $process.WaitForExit(5000)) { Stop-Process -Id $process.Id -Force }
  }
}

function Get-InstalledEntry {
  Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'Coder mega-brain' } |
    Select-Object -First 1
}

Push-Location $projectRoot
try {
  if (-not $SkipBuild) {
    Write-Host 'Gerando o build de produção...'
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'O build falhou; a instalação atual foi preservada.' }
  }

  $installer = (Get-ChildItem -LiteralPath $bundleDirectory -Filter 'Coder mega-brain_*_x64-setup.exe' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  if (-not $installer) { throw "Instalador não encontrado em: $bundleDirectory" }

  Stop-InstalledApp
  $installed = Get-InstalledEntry
  if ($installed) {
    $location = ([string]$installed.InstallLocation).Trim('"')
    $uninstaller = Join-Path $location 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
      Write-Host 'Removendo a instalação anterior...'
      $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
      if ($uninstall.ExitCode -ne 0) { throw "A desinstalação falhou (código $($uninstall.ExitCode))." }
    }
  }

  Write-Host 'Instalando a nova versão...'
  $install = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  if ($install.ExitCode -ne 0) { throw "A instalação falhou (código $($install.ExitCode))." }

  $entry = Get-InstalledEntry
  if (-not $entry) { throw 'A instalação terminou, mas não foi registrada no Windows.' }
  Write-Host "Instalado: $($entry.DisplayVersion) em $(([string]$entry.InstallLocation).Trim('"'))"

  if (-not $NoLaunch) {
    $location = ([string]$entry.InstallLocation).Trim('"')
    Start-Process -FilePath (Join-Path $location 'coder-mega-brain.exe')
  }
  if (-not $KeepInstaller) { Write-Host "Instalador preservado em: $installer" }
}
finally {
  Pop-Location
}
