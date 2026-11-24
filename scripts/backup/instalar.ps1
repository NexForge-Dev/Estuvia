# Instala o backup diario no Windows: pasta, arquivo da chave (vazio), comando e tarefa agendada.
# Nao grava nenhum segredo: a chave e colada por voce em backup.env. Rodar de novo nao apaga nada.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\backup\instalar.ps1 [-Hora 12:30] [-SemTarefa]
param([string]$Hora = '12:30', [switch]$SemTarefa)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$base = Join-Path $env:LOCALAPPDATA 'Estuvia'
$dest = Join-Path $base 'backups'
$node = (Get-Command node).Source
New-Item -ItemType Directory -Force $dest | Out-Null

$envFile = Join-Path $base 'backup.env'
if (-not (Test-Path $envFile)) {
  Set-Content -Encoding ascii $envFile @(
    '# Chave do banco de PRODUCAO. Cole depois do sinal de igual e salve. Nao compartilhe este arquivo.'
    'SUPABASE_URL=https://trdpcjvyfieumxakhwop.supabase.co'
    'SUPABASE_SECRET_KEY='
    'BACKUP_AMBIENTE=production')
}
# So a sua conta do Windows le a chave e as copias (elas tem dados pessoais).
foreach ($p in @($envFile, $dest)) {
  $perm = if ((Get-Item $p).PSIsContainer) { '(OI)(CI)F' } else { 'F' }
  & icacls $p /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:$perm" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls falhou em $p" }
}

$aviso = Join-Path $base 'backup-aviso.ps1'
Set-Content -Encoding ascii $aviso @(
  'Add-Type -AssemblyName System.Windows.Forms, System.Drawing'
  '$n = New-Object System.Windows.Forms.NotifyIcon'
  '$n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true'
  '$n.ShowBalloonTip(20000, "Estuvia: backup com problema", "Veja backup.log em AppData\Local\Estuvia.", "Warning")'
  'Start-Sleep -Seconds 20; $n.Dispose()')

$cmd = Join-Path $base 'backup.cmd'
Set-Content -Encoding ascii $cmd @(
  '@echo off'
  'rem Backup diario da producao (banco + arquivos), com restauracao conferida.'
  "cd /d `"$repo`""
  "`"$node`" --env-file=`"%LOCALAPPDATA%\Estuvia\backup.env`" scripts\backup\run.mjs --destino `"%LOCALAPPDATA%\Estuvia\backups`" >> `"%LOCALAPPDATA%\Estuvia\backup.log`" 2>&1"
  'set RC=%ERRORLEVEL%'
  'if not "%RC%"=="0" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\Estuvia\backup-aviso.ps1"'
  'exit /b %RC%')

if (-not $SemTarefa) {
  $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`""
  $trigger = New-ScheduledTaskTrigger -Daily -At $Hora
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'Estuvia Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Backup diario da producao da Estuvia, com restauracao conferida.' -Force | Out-Null
}
Write-Output "Pronto. Chave: $envFile"
