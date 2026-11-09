[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$BuildVersion,
  [Parameter()]
  [string]$ConfigEnvironment,
  [Parameter()]
  [switch]$NoPreinstallPrivatePlugins,
  [Parameter()]
  [switch]$Sign
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) {
  [Console]::Error.WriteLine($Message)
  exit 1
}

$repositoryRoot = $PSScriptRoot
Set-Location $repositoryRoot

if ($env:OS -ne 'Windows_NT') {
  Fail 'build-win64.ps1 requires a Windows x64 host.'
}
foreach ($command in 'node', 'pnpm') {
  if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) {
    Fail "build-win64.ps1 requires $command on PATH."
  }
}
$nodeArchitecture = (& node -p 'process.arch').Trim()
if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -ne 'x64') {
  Fail 'build-win64.ps1 requires an x64 Node.js runtime on Windows.'
}
if (-not (Test-Path -LiteralPath 'apps/desktop/.env.windows' -PathType Leaf)) {
  Fail 'Missing apps/desktop/.env.windows; copy apps/desktop/.env.windows.example and configure the build settings.'
}

Remove-Item Env:ELECTRON_CUSTOM_DIR -ErrorAction SilentlyContinue
$pythonInstaller = Join-Path (Split-Path -Parent $repositoryRoot) 'offline/python-3.14.10-amd64.exe'
if (-not (Test-Path -LiteralPath $pythonInstaller -PathType Leaf)) {
  Fail "Missing bundled Python installer: $pythonInstaller"
}
$pythonInstallerHash = (Get-FileHash -LiteralPath $pythonInstaller -Algorithm SHA256).Hash
if ($pythonInstallerHash -ne '92480239264744FE0386A1BD8275786FEFA126E3129E56A68E22B52C73329965') {
  Fail "Python installer has unexpected SHA-256: $pythonInstallerHash"
}

$interactive = -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected
if ($interactive) {
  $preferencesJson = & node scripts/desktop-build-preferences.mjs read win64
  if ($LASTEXITCODE -ne 0) {
    Fail 'Could not read Desktop build preferences.'
  }
  $preferences = $preferencesJson | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($BuildVersion)) {
    $BuildVersion = [string]$preferences.buildVersion
  }
  if ([string]::IsNullOrWhiteSpace($ConfigEnvironment)) {
    $ConfigEnvironment = [string]$preferences.configEnvironment
  }
  $environmentDefault = if ([string]::IsNullOrWhiteSpace($ConfigEnvironment)) { '未选择' } else { $ConfigEnvironment }
  $enteredEnvironment = Read-Host "配置环境名 [$environmentDefault；回车沿用，输入 - 清除]"
  if (-not [string]::IsNullOrWhiteSpace($enteredEnvironment)) {
    $ConfigEnvironment = if ($enteredEnvironment -eq '-') { '' } else { $enteredEnvironment }
  }
  if (-not [string]::IsNullOrWhiteSpace($ConfigEnvironment) -and $ConfigEnvironment -cnotmatch '^[a-z0-9][a-z0-9-]*$') {
    Fail 'Configuration environment must match ^[a-z0-9][a-z0-9-]*$.'
  }
  $versionDefault = if ([string]::IsNullOrWhiteSpace($BuildVersion)) { '请输入版本' } else { $BuildVersion }
  $enteredVersion = Read-Host "Desktop 版本 [$versionDefault；回车沿用]"
  if (-not [string]::IsNullOrWhiteSpace($enteredVersion)) {
    $BuildVersion = $enteredVersion
  }
  if ([string]::IsNullOrWhiteSpace($BuildVersion)) {
    Fail 'A Desktop build version is required.'
  }
  $environmentSummary = if ([string]::IsNullOrWhiteSpace($ConfigEnvironment)) { '未选择' } else { $ConfigEnvironment }
  $confirmation = Read-Host "准备打包：配置环境=$environmentSummary，版本=$BuildVersion。确认开始？[y/N]"
  if ($confirmation -notmatch '^(y|yes)$') {
    Write-Output 'Packaging cancelled.'
    exit 0
  }
  if ([string]::IsNullOrWhiteSpace($ConfigEnvironment)) {
    & node scripts/desktop-build-preferences.mjs write win64 $BuildVersion
  }
  else {
    & node scripts/desktop-build-preferences.mjs write win64 $BuildVersion $ConfigEnvironment
  }
  if ($LASTEXITCODE -ne 0) {
    Fail 'Could not save Desktop build preferences.'
  }
}
elseif ([string]::IsNullOrWhiteSpace($BuildVersion)) {
  Fail 'A build version is required when input is not interactive.'
}
if (-not [string]::IsNullOrWhiteSpace($ConfigEnvironment) -and $ConfigEnvironment -cnotmatch '^[a-z0-9][a-z0-9-]*$') {
  Fail 'Configuration environment must match ^[a-z0-9][a-z0-9-]*$.'
}
$packageArguments = @('--build-version', $BuildVersion)
if (-not $NoPreinstallPrivatePlugins) {
  $packageArguments += '--preinstall-private-plugins'
}
if (-not [string]::IsNullOrWhiteSpace($ConfigEnvironment)) {
  $packageArguments += @('--config-env', $ConfigEnvironment)
}
$packageScript = if ($Sign) { 'package:desktop:win:x64' } else { 'package:desktop:win:x64:unsigned' }
$pnpmArguments = @('run', $packageScript, '--') + $packageArguments

$previousPythonInstaller = $env:DSH_DESKTOP_PYTHON_INSTALLER
$env:DSH_DESKTOP_PYTHON_INSTALLER = $pythonInstaller
$previousPluginRegistry = $env:DSH_DESKTOP_PREINSTALLED_PLUGIN_REGISTRY
$env:DSH_DESKTOP_PREINSTALLED_PLUGIN_REGISTRY = 'https://hxflnexus.superbpm.com/repository/npm-group/'
try {
  & pnpm @pnpmArguments
}
finally {
  if ($null -eq $previousPythonInstaller) {
    Remove-Item Env:DSH_DESKTOP_PYTHON_INSTALLER -ErrorAction SilentlyContinue
  }
  else {
    $env:DSH_DESKTOP_PYTHON_INSTALLER = $previousPythonInstaller
  }
  if ($null -eq $previousPluginRegistry) {
    Remove-Item Env:DSH_DESKTOP_PREINSTALLED_PLUGIN_REGISTRY -ErrorAction SilentlyContinue
  }
  else {
    $env:DSH_DESKTOP_PREINSTALLED_PLUGIN_REGISTRY = $previousPluginRegistry
  }
}
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
