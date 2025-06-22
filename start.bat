@echo off
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ffmpeg.exe >nul 2>&1
setlocal enabledelayedexpansion
echo Reading stream key from render.yaml...

for /f "tokens=1,* delims=: " %%a in ('findstr /c:"value:" render.yaml') do (
    set "streamkey=%%b"
)

rem Remove leading/trailing spaces and quotes
set "streamkey=%streamkey:~1,-1%"

if not defined streamkey (
    echo Error: Could not find stream key in render.yaml
    pause
    exit /b 1
)

set "fontpath=%cd%\\assets\\Remains(RUS BY LYAJKA) Regular.ttf"
set "fontpath=!fontpath:\=/!"
set "fontpath=!fontpath::=\:!"

echo Starting stream...
set streamkey=%streamkey%
set fontpath=%fontpath%

node main.js

endlocal 