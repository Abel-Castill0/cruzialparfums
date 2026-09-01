param([int]$Port = 8421)

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-Host "Cruzial local QA: http://localhost:$Port/"
python -m http.server $Port
