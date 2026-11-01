[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('install', 'uninstall')]
  [string]$Operation,
  [Parameter(Mandatory)]
  [string]$Destination,
  [string]$Installer
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-NormalizedPathEntry([string]$Entry) {
  try {
    return [IO.Path]::GetFullPath($Entry.Trim().TrimEnd('\', '/')).TrimEnd('\', '/')
  }
  catch {
    return $Entry.Trim().TrimEnd('\', '/')
  }
}

function Publish-UserPath([bool]$Add) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  if ($null -eq $key) { throw 'Cannot open the current-user Environment registry key.' }
  try {
    $value = $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    if ($value -isnot [string]) { throw 'The current-user PATH value is not a string.' }
    $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
    if ($kind -notin @([Microsoft.Win32.RegistryValueKind]::String, [Microsoft.Win32.RegistryValueKind]::ExpandString)) {
      throw 'The current-user PATH registry value has an unsupported type.'
    }
    $entries = @($value.Split(';') | Where-Object { $_.Trim() -ne '' })
    $managedPaths = @($Destination, (Join-Path $Destination 'Scripts'))
    $expected = @($managedPaths | ForEach-Object { Get-NormalizedPathEntry $_ })
    if ($Add) {
      foreach ($managedPath in $managedPaths) {
        $normalizedPath = Get-NormalizedPathEntry $managedPath
        if (-not ($entries | Where-Object { (Get-NormalizedPathEntry $_) -ieq $normalizedPath })) {
          $entries = @($managedPath) + $entries
        }
      }
    }
    else {
      $entries = @($entries | Where-Object { $expected -notcontains (Get-NormalizedPathEntry $_) })
    }
    $newValue = $entries -join ';'
    if ($newValue.Length -gt 32767) { throw 'The current-user PATH would exceed the Windows limit.' }
    $key.SetValue('Path', $newValue, $kind)
  }
  finally {
    $key.Dispose()
  }
  $signature = @'
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode, SetLastError = true)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.UIntPtr lpdwResult);
'@
  Add-Type -Namespace DshPythonRuntime -Name NativeMethods -MemberDefinition $signature -ErrorAction SilentlyContinue
  $result = [UIntPtr]::Zero
  [void][DshPythonRuntime.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero,
    'Environment', 0x0002, 5000, [ref]$result)
}

if ($Operation -eq 'uninstall') {
  if ($Installer -and (Test-Path -LiteralPath $Installer -PathType Leaf)) {
    & $Installer /uninstall /quiet
    if ($LASTEXITCODE -ne 0) { throw "Python installer uninstall failed with exit code $LASTEXITCODE." }
  }
  Publish-UserPath $false
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Installer) -or -not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  throw 'The bundled Python installer is missing.'
}
$expectedHash = '92480239264744FE0386A1BD8275786FEFA126E3129E56A68E22B52C73329965'
if ((Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash -ne $expectedHash) {
  throw 'The bundled Python installer failed its SHA-256 check.'
}

$destinationPath = [IO.Path]::GetFullPath($Destination)
$pythonExecutable = Join-Path $destinationPath 'python.exe'
$pipExecutable = Join-Path $destinationPath 'Scripts\pip.exe'
if ((Test-Path -LiteralPath $destinationPath) -and (Test-Path -LiteralPath $pythonExecutable -PathType Leaf) -and
  (Test-Path -LiteralPath $pipExecutable -PathType Leaf)) {
  $versionOutput = & $pythonExecutable --version 2>&1
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^Python 3\.14\.10(?:\s|$)') {
    throw "Python runtime destination does not contain Python 3.14.10: $destinationPath"
  }
  $pipOutput = & $pythonExecutable -m pip --version 2>&1
  if ($LASTEXITCODE -ne 0 -or $pipOutput -notmatch '\bpip\b') {
    throw "Python 3.14.10 pip check failed: $destinationPath"
  }
}
else {
  if (Test-Path -LiteralPath $destinationPath) { throw "Python runtime destination already exists and is incomplete: $destinationPath" }
  $installerArguments = @('/quiet', 'InstallAllUsers=0', "TargetDir=$destinationPath", 'Include_pip=1',
    'Include_test=0', 'Include_launcher=0', 'PrependPath=0', 'AppendPath=0', 'Shortcuts=0', 'AssociateFiles=0')
  & $Installer @installerArguments
  if ($LASTEXITCODE -ne 0) { throw "Python installer failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath $pythonExecutable -PathType Leaf) -or
    -not (Test-Path -LiteralPath $pipExecutable -PathType Leaf)) {
    throw 'Python installer completed without both python.exe and Scripts\pip.exe.'
  }
  $versionOutput = & $pythonExecutable --version 2>&1
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^Python 3\.14\.10(?:\s|$)') {
    throw "Python installer did not install Python 3.14.10: $versionOutput"
  }
}

Publish-UserPath $true
