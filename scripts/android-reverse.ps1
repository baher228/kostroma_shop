$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$localAdb = Join-Path $repoRoot 'platform-tools-local\platform-tools\adb.exe'
$systemAdb = Get-Command adb -ErrorAction SilentlyContinue
$adb = if (Test-Path -LiteralPath $localAdb) { $localAdb } elseif ($systemAdb) { $systemAdb.Source } else { throw 'adb.exe was not found.' }

& $adb start-server | Out-Null
$deviceLine = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '^(\S+)\s+device$' } | Select-Object -First 1
if (-not $deviceLine) { throw 'No authorized Android device is connected.' }
$serial = ([regex]::Match($deviceLine, '^(\S+)')).Groups[1].Value

foreach ($port in 4000, 4001, 8081, 8082) {
  & $adb -s $serial reverse "tcp:$port" "tcp:$port" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to reverse tcp:$port for $serial." }
}

Write-Host "Android device $serial is connected to Analitika ports:"
& $adb -s $serial reverse --list