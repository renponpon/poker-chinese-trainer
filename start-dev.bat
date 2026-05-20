@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ===============================================
echo Poker Chinese Trainer - Dev Server
echo ===============================================
echo.
echo Starting Next.js on http://localhost:3010  (same Wi-Fi: http://YOUR_PC_IP:3010 )
echo See README 「B. スマホから使う」 for YOUR_PC_IP
echo (Ctrl+C to stop)
echo.
start "" "http://localhost:3010"
call npm run dev
pause
