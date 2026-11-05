param([string]$Executable)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Executable) { $Executable = Join-Path $projectRoot 'src-tauri\target\release\coder-mega-brain.exe' }
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$testId = [Guid]::NewGuid().ToString('N')
$fixture = Join-Path $projectRoot "artifacts\smoke-$testId"
$remote = Join-Path $projectRoot "artifacts\remote-$testId.git"
New-Item -ItemType Directory -Path $fixture,$remote -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $fixture 'index.html'), '<!doctype html><meta charset="utf-8"><title>Teste pessoal</title><h1>Teste pessoal</h1>')
[IO.File]::WriteAllText((Join-Path $fixture 'package.json'), '{"name":"teste-pessoal","private":true,"scripts":{"smoke":"node -e \"console.log(''SCRIPT_OK'')\""}}')
[IO.File]::WriteAllText((Join-Path $fixture '.env'), 'SEGREDO_TESTE=nao_expor')
git -C $fixture init | Out-Null
git -C $fixture config user.name 'Teste pessoal'
git -C $fixture config user.email 'teste@example.invalid'
git -C $remote init --bare | Out-Null
git -C $fixture remote add origin $remote
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start()
$debugPort = $listener.LocalEndpoint.Port
$listener.Stop()
$previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$previousUserData = $env:WEBVIEW2_USER_DATA_FOLDER
$testProcess = $null
try {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$debugPort --remote-debugging-address=127.0.0.1"
  $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $projectRoot "artifacts\webview-$testId"
  $testProcess = Start-Process -FilePath $Executable -ArgumentList ('"' + $fixture + '"') -WindowStyle Hidden -PassThru
} finally {
  if ($null -eq $previousArguments) { Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue } else { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments }
  if ($null -eq $previousUserData) { Remove-Item Env:WEBVIEW2_USER_DATA_FOLDER -ErrorAction SilentlyContinue } else { $env:WEBVIEW2_USER_DATA_FOLDER = $previousUserData }
}
try {
  node (Join-Path $PSScriptRoot 'smoke-native.mjs') $debugPort $fixture
  if ($LASTEXITCODE -ne 0) { throw 'O teste nativo falhou.' }
} finally {
  if ($testProcess -and -not $testProcess.HasExited) {
    $null = $testProcess.CloseMainWindow()
    if (-not $testProcess.WaitForExit(5000)) { Stop-Process -Id $testProcess.Id }
  }
}
