<#
.SYNOPSIS
    Clean launch: both bots, no syntax errors
#>
param(
    [switch]$Detach
)

Write-Host "Launching both bots..." -ForegroundColor Cyan
docker compose --profile both up -d

Write-Host "Both bots starting..." -ForegroundColor Green
Write-Host "Check Minecraft: localhost:19565" -ForegroundColor Green
Write-Host "Discord: MindcraftBot should go online" -ForegroundColor Green
Write-Host "Logs: docker compose logs -f mindcraft" -ForegroundColor Green

if ($Detach) {
    Write-Host "Detached - running in background" -ForegroundColor Green
}
