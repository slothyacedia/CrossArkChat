@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."
set "ROOT=%cd%"
echo Project Root: %ROOT%
echo.
call pkg "%ROOT%\CrossArkChat.js" --targets node18-win-x64 --output "%~dp0CrossArkChat.exe"
echo Done! Exit code: %errorlevel%
pause