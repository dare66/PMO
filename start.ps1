# Starts Meridian with Docker Compose on Windows (PowerShell 5.1+ or 7+).
# On first run creates .env with random secrets. Usage:  powershell -ExecutionPolicy Bypass -File .\start.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error 'Docker Desktop is required: https://docs.docker.com/get-docker/'; exit 1 }

function New-Secret([int]$Length) {
  $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

if (-not (Test-Path .env)) {
  $lines = Get-Content .env.example | ForEach-Object {
    if ($_ -match '^POSTGRES_PASSWORD=') { "POSTGRES_PASSWORD=$(New-Secret 24)" }
    elseif ($_ -match '^JWT_SECRET=') { "JWT_SECRET=$(New-Secret 48)" }
    elseif ($_ -match '^DEMO_PASSWORD=') { "DEMO_PASSWORD=Demo-$(New-Secret 10)1" }
    else { $_ }
  }
  # UTF-8 without BOM so docker compose reads the first variable correctly
  [System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot '.env'), [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'Created .env with random secrets.'
}

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$envFile = Get-Content .env
$port = ($envFile | Where-Object { $_ -match '^WEB_PORT=' }) -replace '^WEB_PORT=', ''
if (-not $port) { $port = '8080' }
Write-Host ''
Write-Host "Meridian is starting at http://localhost:$port  (first start takes a minute while the database is seeded)"
if ($envFile -contains 'SEED_DEMO=true') {
  Write-Host 'Demo sign-in: admin@demo.example (or ceo@, pmo@, pm1@, product@, bcm@, finance@, tester@, release@, ops@, auditor@ ...)'
  Write-Host ("Demo password: " + (($envFile | Where-Object { $_ -match '^DEMO_PASSWORD=' }) -replace '^DEMO_PASSWORD=', ''))
}
