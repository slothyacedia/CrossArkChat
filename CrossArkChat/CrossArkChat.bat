@echo off
setlocal EnableDelayedExpansion
title CrossArkChat.js

if exist PID.txt (
    set /p OLD_PID=<PID.txt
    echo Killing Old CrossArkChat.js, Instance PID !OLD_PID!

    taskkill /PID !OLD_PID! /F >nul 2>&1

    del PID.txt >nul 2>&1
)

:: -----------------------
:: Variables
:: -----------------------
set "node=0"
set "git=0"
set "winget=0"
set "needInstalls=0"
set "relaunchNeeded=0"
set "logging=0"
set "persist=0"

echo Running Checks...
echo.

:: -----------------------
:: Check Node.js
:: -----------------------
echo Checking For Node.js...
node -v >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo Node.js Detected
    set "node=1"
) else (
    echo Node.js Missing
    set "needInstalls=1"
)
echo.

:: -----------------------
:: Check git
:: -----------------------
echo Checking For git...
git -v >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo git Detected
    set "git=1"
) else (
    echo git Missing
    set "needInstalls=1"
)
echo.

:: -----------------------
:: All Present → Check Modules
:: -----------------------
if !node! equ 1 (
    if !git! equ 1 (
        if !needInstalls! equ 0 (
            goto npmInstall
        )
    )
)

:: -----------------------
:: If Missing → Try winget Install
:: -----------------------
if !needInstalls! equ 1 (
    echo Some Requirements Missing, Attempting Installation...
    
    winget -v >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo winget Detected, Installing Missing Packages...
        set "winget=1"
        echo.
    ) else (
        echo winget Not Found...
        echo Please Install The Microsoft App Installer From The Store:
        echo https://aka.ms/getwinget
        echo Or Download Manually From GitHub:
        echo https://github.com/microsoft/winget-cli/releases
        pause
        exit /b 1
    )

    :: Install Node.js if missing
    if !node! equ 0 (
        echo Installing Node.js...
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        echo Node.js Installed
        set "relaunchNeeded=1"
        echo.
    )

    :: Install git if missing
    if !git! equ 0 (
        echo Installing git...
        winget install Git.Git --accept-package-agreements --accept-source-agreements
        echo git Installed
        set "relaunchNeeded=1"
        echo.
    )

    :: Relaunch in a fresh CMD window to pick up new PATH
    if !relaunchNeeded! equ 1 (
        echo Installations Complete, Relaunching Script In New CMD Window...
        timeout /t 1 /nobreak >nul
        start "" cmd /c "%~f0"
        exit /b 0
    )
)

:: -----------------------
:: NPM Install
:: -----------------------
:npmInstall
echo Checking For Modules...
if exist node_modules (
    echo node_modules Folder Exists, Skipping Module Installation...
) else (
    echo node_modules Folder Not Found, Running Additional Checks...
    if exist package.json (
        echo package.json Found, Installing Modules...
        echo.
        npm install
        echo.
        echo Modules Installed...
        echo Please Restart This Script In A New Window...
        pause
        exit /b 0
    ) else (
        echo package.json Not Found, Skipping Module Installation...
    )
)
echo.

:: -----------------------
:: Start Bot
:: -----------------------
:startBot
cls
for %%A in (%*) do (
    if /I "%%A"=="-persist" set "persist=1"
    if /I "%%A"=="-p" set "persist=1"

    if /I "%%A"=="-logging" set "logging=1"
    if /I "%%A"=="-l" set "logging=1"
)

if %persist% equ 1 (
    echo Persist Enabled...
) else (
    echo Persist Disabled...
    echo To Enable Persist, Start The Script With A -p Argument...
)
if %logging% equ 1 (
    echo Logging To File Enabled...
) else (
    echo Logging To File Disabled...
    echo To Enable Logging To File, Start The Script With A -l Argument...
)
echo.

echo All Checks Passed, Starting CrossArkChat.js...
:restartBot

if %logging% equ 1 (
  if not exist logs mkdir logs
  for /f %%A in ('powershell -NoProfile -Command "Get-Date -Format dd-MMM-yy_HHmm_hh-mmtt"') do set "logStart=%%A"
  set "logFile=logs\!logStart!.log"
  powershell -Command "node CrossArkChat.js | Tee-Object -FilePath '!logFile!' -Append"
) else (
  powershell -Command "node CrossArkChat.js"
)

if !ERRORLEVEL! neq 0 (
    echo CrossArkChat.js Exited With An Error...
) else (
    echo CrossArkChat.js Exited Without An Error...
)

if %persist% equ 1 (
    echo.
    echo Restarting CrossArkChat.js...
    goto restartBot
)

exit /b 0
