# Poker Chinese Trainer → Vercel 本番デプロイ
# 使い方: PowerShell でこのフォルダに移動し、 .\deploy-vercel.ps1 を実行
# 初回のみブラウザで Vercel ログインが開きます。

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== 1/2 ビルド (npm run build) ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ビルド失敗。ログを確認してください。" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== 2/2 Vercel 本番デプロイ ===" -ForegroundColor Cyan
Write-Host "初回: ログイン案内が出ます。環境変数はデプロイ後に Dashboard で設定してください。" -ForegroundColor Yellow
Write-Host ""

npx --yes vercel@latest deploy --prod

Write-Host ""
Write-Host "デプロイ後の必須作業:" -ForegroundColor Green
Write-Host "  Vercel Project → Settings → Environment Variables で次を設定し、Redeploy:" -ForegroundColor White
Write-Host "    GEMINI_API_KEY , NOTION_API_KEY , NOTION_DATABASE_ID" -ForegroundColor White
Write-Host ""
