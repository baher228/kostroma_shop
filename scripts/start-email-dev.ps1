$ErrorActionPreference = 'Stop'
$emailProject = Split-Path -Parent $PSScriptRoot
$emailRuntime = Join-Path $emailProject '.local-runtime'
$emailDatabase = Join-Path $emailRuntime 'postgres'
$emailPgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
$emailPidFile = Join-Path $emailRuntime 'processes.json'

if (-not (Test-Path -LiteralPath (Join-Path $emailDatabase 'PG_VERSION'))) {
  throw 'Local email database has not been initialized. See docs/email-local-testing.md.'
}

if (Test-Path -LiteralPath $emailPidFile) {
  $emailExisting = Get-Content -LiteralPath $emailPidFile -Raw | ConvertFrom-Json
  foreach ($emailRecord in $emailExisting) {
    $emailProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($emailRecord.pid)" -ErrorAction SilentlyContinue
    if ($emailProcess -and $emailProcess.CommandLine -like "*$emailProject*") {
      throw 'Email development processes are already running. Stop them before restarting.'
    }
  }
}

foreach ($emailPort in @(4000, 4001, 5173)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $emailPort -ErrorAction SilentlyContinue) {
    throw "Port $emailPort is already occupied. Stop its process before starting email development."
  }
}

& $emailPgCtl -D $emailDatabase status *> $null
if ($LASTEXITCODE -ne 0) {
  & $emailPgCtl -D $emailDatabase -l (Join-Path $emailRuntime 'postgres.log') -o '-h 127.0.0.1 -p 5545' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Unable to start local email PostgreSQL.' }
}

$emailServices = @(
  @{name='ru'; folder='services/ru-backend'; entry='dist/server.js'; arguments=@()},
  @{name='dubai'; folder='services/dubai-backend'; entry='dist/server.js'; arguments=@()},
  @{name='dashboard'; folder='web-dashboard'; entry='node_modules/vite/bin/vite.js'; arguments=@('--host', '127.0.0.1', '--port', '5173', '--strictPort')}
)
$emailStarted = @()
foreach ($emailService in $emailServices) {
  $emailWorkingDirectory = Join-Path $emailProject $emailService.folder
  $emailEntry = Join-Path $emailWorkingDirectory $emailService.entry
  if (-not (Test-Path -LiteralPath $emailEntry)) { throw "Missing entry point: $emailEntry. Install dependencies and build backends first." }
  $emailArguments = @('"' + $emailEntry + '"') + $emailService.arguments
  $emailProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $emailArguments -WorkingDirectory $emailWorkingDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $emailRuntime ($emailService.name + '.stdout.log')) -RedirectStandardError (Join-Path $emailRuntime ($emailService.name + '.stderr.log')) -PassThru
  $emailStarted += @{name=$emailService.name; pid=$emailProcess.Id; startedAt=$emailProcess.StartTime.ToUniversalTime().ToString('o')}
  $emailStarted | ConvertTo-Json | Set-Content -LiteralPath $emailPidFile -Encoding UTF8
}
$emailReadyDeadline = (Get-Date).AddSeconds(25)
$emailReady = $false
do {
  foreach ($emailRecord in $emailStarted) {
    if (-not (Get-Process -Id $emailRecord.pid -ErrorAction SilentlyContinue)) {
      throw "Email service $($emailRecord.name) exited. Check .local-runtime logs and run the stop script."
    }
  }
  try {
    foreach ($emailUrl in @('http://127.0.0.1:5173/', 'http://127.0.0.1:4000/api/health', 'http://127.0.0.1:4001/api/health')) {
      $emailResponse = Invoke-WebRequest -Uri $emailUrl -UseBasicParsing -TimeoutSec 2
      if ($emailResponse.StatusCode -ne 200) { throw 'Service is not ready.' }
    }
    $emailReady = $true
  } catch { Start-Sleep -Milliseconds 300 }
} while (-not $emailReady -and (Get-Date) -lt $emailReadyDeadline)
if (-not $emailReady) { throw 'Email development health check timed out. Check .local-runtime logs.' }
Write-Output 'Email development started: http://127.0.0.1:5173'
