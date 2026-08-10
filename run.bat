@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies, first run only...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

echo Starting Anime Plex Converter (dev mode)...
call npm run dev:electron
pause
