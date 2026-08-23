#Requires -Version 5.1
<#
.SYNOPSIS
  Sauvegarde de la base MySQL JOBSINC vers backups\YYYY-MM-JJ_HHmm.sql.
.USAGE
  .\backup-database.ps1                       # sauvegarde manuelle
  .\backup-database.ps1 -KeepDays 14          # purge les fichiers > 14 jours
.PLANIFICATION (tous les jours a 02:00, en tant qu'utilisateur courant)
  schtasks /Create /TN "JOBSINC-Backup" /SC DAILY /ST 02:00 ^
    /TR "powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\diamproject\JOBSINC\backend\scripts\backup-database.ps1' -KeepDays 14"
#>
param([int]$KeepDays = 14)

$ErrorActionPreference = 'Stop'
$MysqlDump = 'C:\xampp\mysql\bin\mysqldump.exe'
$DbName    = 'JOBSINC'

if (-not (Test-Path $MysqlDump)) { throw "mysqldump introuvable : $MysqlDump" }

$backupDir = Join-Path $PSScriptRoot '..\backups' | Resolve-Path -ErrorAction SilentlyContinue
if (-not $backupDir) {
  $backupDir = New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot '..\backups') -Force
}
$stamp   = Get-Date -Format 'yyyy-MM-dd_HHmm'
$outFile = Join-Path $backupDir "$($DbName)_$stamp.sql"

& $MysqlDump --user=root --single-transaction --routines --triggers $DbName | Set-Content -LiteralPath $outFile -Encoding UTF8

if ((Get-Item $outFile).Length -lt 1KB) { throw "Sauvegarde suspecte (fichier < 1 Ko) : $outFile" }
Write-Host "OK : $outFile ($('{0:N0}' -f (Get-Item $outFile).Length) octets)"

if ($KeepDays -gt 0) {
  $limit = (Get-Date).AddDays(-$KeepDays)
  Get-ChildItem -LiteralPath $backupDir -Filter "$($DbName)_*.sql" |
    Where-Object { $_.LastWriteTime -lt $limit } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName; Write-Host "Purge : $($_.Name)" }
}
