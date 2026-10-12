[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [string]$BuildVersion,
  [Parameter()]
  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
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

$packageArguments = @('--build-version', $BuildVersion)
if (-not $NoPreinstallPrivatePlugins) {
  $packageArguments += '--preinstall-private-plugins'
}
if (-not [string]::IsNullOrWhiteSpace($ConfigEnvironment)) {
  $packageArguments += @('--config-env', $ConfigEnvironment)
}
$packageScript = if ($Sign) { 'package:desktop:win:x64' } else { 'package:desktop:win:x64:unsigned' }
$pnpmArguments = @('run', $packageScript, '--') + $packageArguments
Remove-Item Env:ELECTRON_CUSTOM_DIR -ErrorAction SilentlyContinue
& pnpm @pnpmArguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
