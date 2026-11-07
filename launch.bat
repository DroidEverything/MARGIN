@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ---------------------------------------------------------------
REM MARGIN local launcher
REM Browsers block ES modules and binary asset fetches on file://,
REM so the game must be served over HTTP. This starts a local server
REM and opens the game. Close this window or press Ctrl+C to stop.
REM ---------------------------------------------------------------

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/"

REM Find Python 3 (py launcher first, then python on PATH)
set "PY="
py -3 --version >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if defined PY goto havepython

python -c "import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)" >nul 2>&1
if not errorlevel 1 set "PY=python"
if defined PY goto havepython

echo.
echo  Python 3 was not found on PATH.
echo  Install it from https://www.python.org/downloads/
echo  (tick "Add python.exe to PATH"), then run launch.bat again.
echo.
pause
exit /b 1

:havepython
echo.
echo  MARGIN - local server
echo  ---------------------
echo  Game:  %URL%
echo  Stop:  Ctrl+C in this window, or close it
echo.
if /i "%MARGIN_NO_BROWSER%"=="1" goto serve
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1500; Start-Process '%URL%'"
:serve
%PY% -m http.server %PORT% --bind 127.0.0.1
echo.
echo  Server stopped.
pause
