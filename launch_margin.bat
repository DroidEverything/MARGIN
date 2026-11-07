@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ---------------------------------------------------------------
REM MARGIN local launcher
REM Browsers block ES modules and binary asset fetches on file://,
REM so the game must be served over HTTP. This starts a local server
REM in a minimized window and opens the game in the default browser.
REM ---------------------------------------------------------------

set "PORT=8906"
set "URL=http://localhost:%PORT%/index.html"

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
echo  (tick "Add python.exe to PATH"), then run launch_margin.bat again.
echo.
pause
exit /b 1

:havepython
echo Starting MARGIN server on port %PORT% ...
start "MARGIN server" /min %PY% -m http.server %PORT% --bind 127.0.0.1
timeout /t 2 /nobreak >nul

echo.
echo  MARGIN: %URL%
echo  The server runs in the minimized window titled "MARGIN server".
echo  To stop it, close that window or run:
echo    taskkill /FI "WINDOWTITLE eq MARGIN server*"
echo.
if /i "%MARGIN_NO_BROWSER%"=="1" goto done
start "" "%URL%"

:done
endlocal
