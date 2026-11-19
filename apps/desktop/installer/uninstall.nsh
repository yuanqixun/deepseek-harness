; Electron user data and updater downloads leave with the application; the Harness home is never touched.
!include FileFunc.nsh
Var UnTarget
Var UnHome
Var UnPythonRuntime

; The helper refuses unsafe roots, the installation, the Harness home, and the shared Python runtime; it never descends into reparse points.
; a locked file leaves residue and never fails the uninstall. customCheckAppRunning extracts window-frame.dll first.
Function un.RemoveData
  System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveData(w "$UnTarget", w "$INSTDIR", w "$UnHome", w "$UnPythonRuntime") ?c'
FunctionEnd

Function un.CleanData
  ${If} ${isUpdated}
    Return
  ${EndIf}
  ; The installer runs an older uninstaller with /KEEP_APP_DATA when replacing it from another directory.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ; Protect the effective Harness home during cleanup.
  ReadEnvStr $UnHome DSH_HOME
  !ifdef DSH_WINDOWS_DSH_HOME_DIRECTORY
    ${If} $UnHome == ""
      ExpandEnvStrings $UnHome "${DSH_WINDOWS_DSH_HOME_DIRECTORY}"
    ${EndIf}
  !endif
  StrCpy $UnPythonRuntime "${DSH_PYTHON_RUNTIME_DIRECTORY}"
  ClearErrors
  !ifdef DSH_WINDOWS_USER_DATA_DIRECTORY
    ExpandEnvStrings $UnTarget "${DSH_WINDOWS_USER_DATA_DIRECTORY}"
    Call un.RemoveData
  !else
    StrCpy $UnTarget "$APPDATA\${PRODUCT_FILENAME}"
    Call un.RemoveData
  !ifdef APP_PACKAGE_NAME
    ; Electron derives user data from the package name; a scoped name nests it one directory deeper.
    StrCpy $UnTarget "$APPDATA\${APP_PACKAGE_NAME}"
    Call un.RemoveData
    System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveEmptyParents(w "$UnTarget", w "$APPDATA") ?c'
  !endif
  !endif
  StrCpy $UnTarget "$LOCALAPPDATA\${DSH_UPDATER_CACHE_NAME}"
  Call un.RemoveData
FunctionEnd
