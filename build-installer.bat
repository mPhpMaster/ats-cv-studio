@echo off
setlocal
rem ============================================================
rem  ATS CV Studio - build the Windows installer
rem
rem  Double-click this file, or run from a terminal:
rem    build-installer.bat              full build (npm ci + installer)
rem    build-installer.bat -SkipInstall reuse existing node_modules
rem    build-installer.bat -Portable    also build a portable .exe
rem    build-installer.bat -Clean       delete dist\ and release\ first
rem
rem  Output: release\ATS-CV-Studio-Setup-<version>.exe
rem ============================================================

cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found on this computer.
  set "EXITCODE=1"
  goto end
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
  echo Build finished successfully. The installer is in: "%~dp0release"
  if exist "%~dp0release" start "" explorer "%~dp0release"
) else (
  echo [ERROR] Build failed with exit code %EXITCODE%. Scroll up to see the error.
)

:end
rem Keep the window open when the file was double-clicked from Explorer.
echo %CMDCMDLINE% | find /i "/c" >nul && pause
exit /b %EXITCODE%
