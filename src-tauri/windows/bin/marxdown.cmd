@echo off
rem Marxdown CLI shim for cmd.exe and PowerShell (OQ-32).
rem NOTE: Keep this file ASCII-only. cmd.exe reads batch files in the console code page.
rem NOTE: cmd.exe waits for GUI-subsystem executables too, so detach with start and return at once.
rem NOTE: --help and --version run in the foreground. Detached, their output never reaches this console.
rem NOTE: A lone - (stdin) also runs in the foreground so the pipe reaches the exe. The exe spools stdin to a temp file, relaunches itself detached and exits (src/stdin.rs).
setlocal
for %%I in ("%~dp0..") do set "MARXDOWN_EXE=%%~fI\marxdown.exe"
if "%~1"=="-h" goto foreground
if "%~1"=="--help" goto foreground
if "%~1"=="-V" goto foreground
if "%~1"=="--version" goto foreground
for %%A in (%*) do if "%%~A"=="-" goto foreground
start "" "%MARXDOWN_EXE%" %*
exit /b 0
:foreground
"%MARXDOWN_EXE%" %*
