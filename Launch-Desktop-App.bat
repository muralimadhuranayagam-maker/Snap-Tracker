@echo off
title SnapServe Tracker Desktop Launcher
echo ===================================================
echo   Launching SnapServe Tracker Native Desktop App...
echo ===================================================
cd /d "%~dp0"

REM Check if installer output exists
if exist "dist-desktop\win-unpacked\SnapServe Tracker.exe" (
    echo Starting SnapServe Tracker Desktop Application...
    start "" "dist-desktop\win-unpacked\SnapServe Tracker.exe"
    exit /b 0
)

if exist "dist-desktop\SnapServe Tracker 1.0.0.exe" (
    echo Starting SnapServe Tracker Portable App...
    start "" "dist-desktop\SnapServe Tracker 1.0.0.exe"
    exit /b 0
)

echo Starting via npm...
npm run desktop:dev
