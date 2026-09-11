#Requires -Version 5.1
<#
.SYNOPSIS
  Sauvegarde de la base PostgreSQL JOBSINC vers backups\YYYY-MM-JJ_HHmm.sql.
.DESCRIPTION
  Utilise pg_dump (Neon ou PostgreSQL local) via la variable DATABASE_URL du .env.
.USAGE
  .\backup-database.ps1                       # sauvegarde manuelle
  .\backup-database.ps1 -KeepDays 14          # purge les fichiers > 14 jours
.PLANIFICATION (tous les jours a 02:00, en tant qu'utilisateur courant)
  schtasks /Create /TN "JOBSINC-Backup" /SC DAILY /ST 02:00 ^
    /TR "powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\diamproject\JOBSINC\backend\scripts\backup-database.ps1' -KeepDays 14"
#>
param([int]$KeepDays = 14)

$ErrorActionPreference = 'Stop'

# Charger la DATABASE_URL depuis le fichier .env
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { throw ".env introuvable : $envFile" }
$envContent = Get-Content -LiteralPath $envFile -Raw
if ($envContent -match 'DATABASE_URL="([^"]+)"') {
  $DATABASE_URL = $Matches[1]
} elseif ($envContent -match "DATABASE_URL='([^']+)'") {
  $DATABASE_URL = $Matches[1]
} else {
  throw "DATABASE_URL introuvable dans $envFile"
}

$backupDir = Join-Path $PSScriptRoot '..\backups'
if (-not (Test-Path $backupDir)) {
  $backupDir = New-Item -ItemType Directory -Path $backupDir -Force
}

$stamp   = Get-Date -Format 'yyyy-MM-dd_HHmm'
$outFile = Join-Path $backupDir "JOBSINC_$stamp.sql"

# Utiliser pg_dump via pg_dump.exe (chercher dans le PATH ou chemins courants)
$pgDump = $null
$candidates = @(
  'pg_dump',
  'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\15\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\14\bin\pg_dump.exe'
)
foreach ($candidate in $candidates) {
  if (Get-Command $candidate -ErrorAction SilentlyContinue) {
    $pgDump = $candidate
    break
  }
}
if (-not $pgDump) { throw "pg_dump introuvable. Installez PostgreSQL ou ajoutez pg_dump au PATH." }

# Exporter DATABASE_URL pour pg_dump
$env:DATABASE_URL = $DATABASE_URL

& $pgDump --no-owner --no-acl --file=$outFile $DATABASE_URL 2>&1 | Out-Null

if (-not (Test-Path $outFile) -or (Get-Item $outFile).Length -lt 1KB) {
  throw "Sauvegarde suspecte (fichier manquant ou < 1 Ko) : $outFile"
}
Write-Host "OK : $outFile ($('{0:N0}' -f (Get-Item $outFile).Length) octets)"

if ($KeepDays -gt 0) {
  $limit = (Get-Date).AddDays(-$KeepDays)
  Get-ChildItem -LiteralPath $backupDir -Filter "JOBSINC_*.sql" |
    Where-Object { $_.LastWriteTime -lt $limit } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName; Write-Host "Purge : $($_.Name)" }
}
