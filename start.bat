@echo off
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ffmpeg.exe >nul 2>&1
setlocal enabledelayedexpansion

set "fontpath=%cd%\\assets\\Remains(RUS BY LYAJKA) Regular.ttf"
set "fontpath=!fontpath:\=/!"
set "fontpath=!fontpath::=\:!"

echo Starting stream...
set "fontpath=%fontpath%"

node main.js

pause
endlocal
