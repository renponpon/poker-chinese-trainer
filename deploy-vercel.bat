@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ===============================================
echo Poker Chinese Trainer - Vercel deploy
echo ===============================================
echo.
echo [1] npm run build
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo [2] Vercel production deploy
echo First time: browser login. After deploy, set env vars on Vercel Dashboard and Redeploy.
echo.
call npx --yes vercel@latest deploy --prod

echo.
echo Required on Vercel: GEMINI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID - then Redeploy
echo.
pause
