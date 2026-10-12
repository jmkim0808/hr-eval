@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\demo.mjs start
pause
