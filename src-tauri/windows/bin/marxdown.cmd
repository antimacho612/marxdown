@echo off
rem Marxdown CLI shim for cmd.exe and PowerShell (docs/06.roadmap/m6-ship.md section 4 / OQ-32).
rem NOTE: Keep this file ASCII-only. cmd.exe reads batch files in the console code page.
rem NOTE: cmd.exe waits for GUI-subsystem executables too, so detach with start and return at once.
rem NOTE: --help and --version run in the foreground. Detached, their output never reaches this console.
setlocal
for %%I in ("%~dp0..") do set "MARXDOWN_EXE=%%~fI\marxdown.exe"
if "%~1"=="-h" goto foreground
if "%~1"=="--help" goto foreground
if "%~1"=="-V" goto foreground
if "%~1"=="--version" goto foreground
start "" "%MARXDOWN_EXE%" %*
exit /b 0
:foreground
"%MARXDOWN_EXE%" %*
