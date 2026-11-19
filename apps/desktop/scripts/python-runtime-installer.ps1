[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('install', 'uninstall')]
  [string]$Operation,
  [Parameter(Mandatory)]
  [string]$Destination,
  [Parameter(Mandatory)]
  [string]$ApplicationId,
  [string]$ProtectedHarnessHome,
  [string]$ProtectedUserData,
  [string]$Installer
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($ApplicationId -notmatch '^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$') {
  throw 'The Desktop application ID is invalid.'
}

$ownerRoot = 'HKCU:\Software\DeepSeek Harness\PythonRuntime\3.14.10\Installations'
$ownerPath = Join-Path $ownerRoot $ApplicationId
$runtimeMutex = [System.Threading.Mutex]::new($false, 'Global\DeepSeekHarnessPython31410')
$hasRuntimeMutex = $false

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

function Test-PathsOverlap([string]$Left, [string]$Right) {
  $leftPath = [IO.Path]::GetFullPath($Left).TrimEnd('\', '/')
  $rightPath = [IO.Path]::GetFullPath($Right).TrimEnd('\', '/')
  if ($leftPath.Length -eq 2 -and $leftPath[1] -eq ':') { $leftPath += '\' }
  if ($rightPath.Length -eq 2 -and $rightPath[1] -eq ':') { $rightPath += '\' }
  return $leftPath.Equals($rightPath, [StringComparison]::OrdinalIgnoreCase) -or
    $leftPath.StartsWith($rightPath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $rightPath.StartsWith($leftPath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Test-RegisteredPythonRuntime([string]$Path) {
  foreach ($version in @('3.14', '3.14-64')) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Python\PythonCore\$version\InstallPath")
    if ($null -eq $key) { continue }
    try {
      $registeredPath = $key.GetValue('')
      if ($registeredPath -is [string] -and (Get-NormalizedPathEntry $registeredPath) -ieq (Get-NormalizedPathEntry $Path)) {
        return $true
      }
    }
    finally {
      $key.Dispose()
    }
  }
  return $false
}

$destinationPath = [IO.Path]::GetFullPath($Destination)
$runtimeMarker = Join-Path $destinationPath '.dsh-runtime-owner'
$runtimeMarkerContents = 'DeepSeek Harness Python 3.14.10'
foreach ($protected in @($ProtectedHarnessHome, $ProtectedUserData)) {
  if (-not [string]::IsNullOrWhiteSpace($protected) -and (Test-PathsOverlap $destinationPath $protected)) {
    throw 'The shared Python runtime overlaps a protected Harness or Electron data directory.'
  }
}

try {
  try { $hasRuntimeMutex = $runtimeMutex.WaitOne([TimeSpan]::FromMinutes(5)) }
  catch [System.Threading.AbandonedMutexException] { $hasRuntimeMutex = $true }
  if (-not $hasRuntimeMutex) { throw 'Timed out waiting for the shared Python runtime.' }
  if ($Operation -eq 'uninstall') {
    $runtimeOwned = $false
    if (Test-Path -LiteralPath $destinationPath -PathType Container) {
      if (-not (Test-Path -LiteralPath $runtimeMarker -PathType Leaf)
        -or [IO.File]::ReadAllText($runtimeMarker) -ne $runtimeMarkerContents) {
        throw 'The shared Python runtime is not owned by DeepSeek Harness.'
      }
      $runtimeOwned = $true
    }
    Remove-Item -LiteralPath $ownerPath -Recurse -Force -ErrorAction SilentlyContinue
    $remainingOwners = @()
    if (Test-Path -LiteralPath $ownerRoot) {
      $remainingOwners = @(Get-ChildItem -LiteralPath $ownerRoot | Where-Object {
        $ownerProperties = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
        $locationProperty = if ($null -eq $ownerProperties) { $null } else { $ownerProperties.PSObject.Properties['InstallLocation'] }
        $installedAt = if ($null -eq $locationProperty) { $null } else { $locationProperty.Value }
        $installedAt -and (Test-Path -LiteralPath $installedAt -PathType Container)
      })
    }
    if ($remainingOwners.Count -eq 0) {
      $removedRuntime = -not $runtimeOwned
      if ($runtimeOwned -and (Test-RegisteredPythonRuntime $destinationPath)
        -and $Installer -and (Test-Path -LiteralPath $Installer -PathType Leaf)) {
        & $Installer /uninstall /quiet
        if ($LASTEXITCODE -ne 0) { throw "Python installer uninstall failed with exit code $LASTEXITCODE." }
        $removedRuntime = $true
      }
      if ($removedRuntime) {
        Publish-UserPath $false
      }
    }
    return
  }

  if ([string]::IsNullOrWhiteSpace($Installer) -or -not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
    throw 'The bundled Python installer is missing.'
  }
  $expectedHash = '92480239264744FE0386A1BD8275786FEFA126E3129E56A68E22B52C73329965'
  if ((Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'The bundled Python installer failed its SHA-256 check.'
  }

  $pythonExecutable = Join-Path $destinationPath 'python.exe'
  $pipExecutable = Join-Path $destinationPath 'Scripts\pip.exe'
  $installedByThisRun = $false
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
    $installedByThisRun = $true
  }
  if ($installedByThisRun) {
    [IO.File]::WriteAllText($runtimeMarker, $runtimeMarkerContents, [Text.UTF8Encoding]::new($false))
  }
  elseif (-not (Test-Path -LiteralPath $runtimeMarker -PathType Leaf)
    -or [IO.File]::ReadAllText($runtimeMarker) -ne $runtimeMarkerContents) {
    throw 'The Python runtime directory exists but is not owned by DeepSeek Harness.'
  }

  Publish-UserPath $true
  New-Item -Path $ownerPath -Force | Out-Null
  Set-ItemProperty -LiteralPath $ownerPath -Name InstallLocation -Value ([IO.Path]::GetFullPath($Destination))
}
finally {
  if ($hasRuntimeMutex) { $runtimeMutex.ReleaseMutex() }
  $runtimeMutex.Dispose()
}
