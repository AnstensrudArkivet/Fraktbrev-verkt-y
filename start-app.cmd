@echo off
setlocal
set "PORT=4174"
set "ROOT=%~dp0"
set "BUNDLED_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%BUNDLED_PY%" (
  set "PY=%BUNDLED_PY%"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Install Python or run this from Codex with the bundled runtime available.
    pause
    exit /b 1
  )
  set "PY=python"
)

cd /d "%ROOT%"
start "" "http://127.0.0.1:%PORT%/index.html?v=20260620-2"
echo Tveter Fraktbrev kjores pa http://127.0.0.1:%PORT%/index.html?v=20260620-2
echo Keep this window open while using the app.
"%PY%" -m http.server %PORT% --bind 127.0.0.1
