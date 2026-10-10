$ErrorActionPreference = 'Stop'
$emailProject = Split-Path -Parent $PSScriptRoot
$emailRuntime = Join-Path $emailProject '.local-runtime'
$emailPidFile = Join-Path $emailRuntime 'processes.json'
if (Test-Path -LiteralPath $emailPidFile) {
  $emailRecords = Get-Content -LiteralPath $emailPidFile -Raw | ConvertFrom-Json
  foreach ($emailRecord in $emailRecords) {
    $emailProcess = Get-Process -Id $emailRecord.pid -ErrorAction SilentlyContinue
    $emailDetails = Get-CimInstance Win32_Process -Filter "ProcessId = $($emailRecord.pid)" -ErrorAction SilentlyContinue
    if ($emailProcess -and $emailDetails -and $emailDetails.CommandLine -like "*$emailProject*") {
      $emailRecordedStart = ([DateTime]$emailRecord.startedAt).ToUniversalTime()
      if ($emailProcess.StartTime.ToUniversalTime().Ticks -ne $emailRecordedStart.Ticks) {
        throw "Process start time differs for PID $($emailRecord.pid); refusing to stop it."
      }
      Stop-Process -Id $emailRecord.pid
      if (-not $emailProcess.WaitForExit(5000)) { throw "Process $($emailRecord.pid) did not stop." }
    }
  }
  Remove-Item -LiteralPath $emailPidFile
}
$emailDatabase = Join-Path $emailRuntime 'postgres'
if (Test-Path -LiteralPath (Join-Path $emailDatabase 'postmaster.pid')) {
  & 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D $emailDatabase -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'Unable to stop local email PostgreSQL.' }
}
Write-Output 'Email development stopped.'
