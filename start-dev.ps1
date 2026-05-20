Set-Location -Path $PSScriptRoot
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Poker Chinese Trainer - Dev Server" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Next.js on http://localhost:3010  (same Wi-Fi: http://YOUR_PC_IP:3010)"
Write-Host "See README section B for YOUR_PC_IP" -ForegroundColor Gray
Write-Host "(Ctrl+C to stop)" -ForegroundColor Gray
Write-Host ""
Start-Process "http://localhost:3010"
npm run dev
