[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoLaunch,
  [switch]$KeepInstaller,
  [switch]$Portable
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$targetDirectory = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $projectRoot 'src-tauri\target' }
$bundleDirectory = Join-Path $targetDirectory 'release\bundle\nsis'
$releaseExecutable = Join-Path $targetDirectory 'release\donkey.exe'

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
  $location = ([string]$entry.InstallLocation).Trim('"').Trim()
  $uninstaller = if ($location) { Join-Path $location 'uninstall.exe' } else { $null }
  if (-not $uninstaller -or -not (Test-Path -LiteralPath $uninstaller)) {
    Write-Host "Sem uninstall.exe para $($entry.DisplayName); desinstalação ignorada."
    return $true
  }

  try {
    Write-Host "Removendo $($entry.DisplayName) $($entry.DisplayVersion)..."
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($uninstall.ExitCode -ne 0) {
      Write-Host "A desinstalação de $($entry.DisplayName) falhou (código $($uninstall.ExitCode))."
      return $false
    }
    return $true
  } catch {
    Write-Host "A desinstalação de $($entry.DisplayName) falhou: $($_.Exception.Message)"
    return $false
  }
}

function Copy-ReleaseExecutable([string]$Destination) {
  $attempts = 5
  for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    try {
      Copy-Item -LiteralPath $releaseExecutable -Destination $Destination -Force -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq $attempts) { throw }
      Start-Sleep -Seconds 1
    }
  }
}

function Install-Portable([string]$Reason, [switch]$Requested) {
  if (-not (Test-Path -LiteralPath $releaseExecutable)) {
    throw "Instalação portátil impossível: executável não encontrado em $releaseExecutable. Motivo original: $Reason"
  }

  Stop-InstalledApp

  $installDir = Join-Path $env:LOCALAPPDATA 'Donkey'
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  $destination = Join-Path $installDir 'donkey.exe'
  Copy-ReleaseExecutable -Destination $destination

  $programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  New-Item -ItemType Directory -Force -Path $programs | Out-Null
  $shortcutPath = Join-Path $programs 'Donkey.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $destination
  $shortcut.WorkingDirectory = $installDir
  $shortcut.Description = 'Donkey'
  $shortcut.IconLocation = "$destination,0"
  $shortcut.Save()

  $installed = Get-Item -LiteralPath $destination
  Write-Host ''
  if ($Requested) {
    Write-Host 'Instalação portátil (-Portable): o setup NSIS não será usado.'
    Write-Host 'Caminho de instalação: portátil (-Portable)'
  } else {
    Write-Host 'O Windows Smart App Control bloqueou o instalador sem assinatura (ou o desinstalador).'
    Write-Host 'A instalação seguiu pelo caminho portátil: o donkey.exe foi copiado, sem setup NSIS.'
    Write-Host "Motivo: $Reason"
    Write-Host 'Caminho de instalação: portátil (fallback)'
  }
  Write-Host "Executável: $($installed.FullName) — $($installed.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host "Atalho do Menu Iniciar: $shortcutPath"
  Write-Host 'Esta cópia não registra uninstall.exe. Para remover, apague a pasta e o atalho.'

  if (-not $NoLaunch) {
    Start-Process -FilePath $destination
    Write-Host 'Aplicativo aberto.'
  }
}

Push-Location $projectRoot
try {
  if (-not $SkipBuild) {
    Write-Host 'Gerando o build de produção...'
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'O build falhou; a instalação atual foi preservada.' }
  }

  if ($Portable) {
    Install-Portable -Reason 'instalação portátil solicitada (-Portable).' -Requested
    return
  }

  $installer = $null
  if (Test-Path -LiteralPath $bundleDirectory) {
    $installer = (Get-ChildItem -LiteralPath $bundleDirectory -Filter "${currentName}_*_x64-setup.exe" -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  }
  if (-not $installer) {
    Install-Portable -Reason "instalador NSIS não encontrado em: $bundleDirectory"
    return
  }

  Stop-InstalledApp

  $entries = @(Get-InstalledEntries ($legacyNames + $currentName))
  if ($entries.Count -eq 0) {
    Write-Host 'Nenhuma instalação registrada; desinstalação ignorada.'
  }

  $uninstallOk = $true
  foreach ($entry in $entries) {
    if (-not (Remove-Installed $entry)) { $uninstallOk = $false }
  }
  if (-not $uninstallOk) {
    Install-Portable -Reason 'o desinstalador falhou ou foi bloqueado (Smart App Control).'
    return
  }

  Write-Host 'Instalando a nova versão...'
  try {
    $install = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($install.ExitCode -ne 0) {
      throw "A instalação falhou (código $($install.ExitCode))."
    }
  } catch {
    Install-Portable -Reason $_.Exception.Message
    return
  }

  $entry = Get-InstalledEntries @($currentName) | Select-Object -First 1
  if (-not $entry) {
    Install-Portable -Reason 'o instalador terminou, mas o aplicativo não foi registrado no Windows.'
    return
  }

  $location = ([string]$entry.InstallLocation).Trim('"')
  $installedExe = Join-Path $location 'donkey.exe'
  $installed = Get-Item -LiteralPath $installedExe
  Write-Host "Instalado: $($entry.DisplayName) $($entry.DisplayVersion) em $location"
  Write-Host "Executável: $($installed.FullName) — $($installed.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host 'Caminho de instalação: NSIS'

  if (-not $NoLaunch) {
    Start-Process -FilePath $installedExe
  }
  if (-not $KeepInstaller) { Write-Host "Instalador preservado em: $installer" }
} finally {
  Pop-Location
}
