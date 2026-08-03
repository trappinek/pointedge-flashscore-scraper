$ErrorActionPreference = "Stop"

$env:HISTORY_FROM = "2023-01-01"
$env:HISTORY_TO = "2026-07-25"
$env:MIN_RECORDS_PER_MONTH = "15"
$env:MIN_PREPARED_PER_MONTH = "15"
$env:PREPARE_COUNT = "700"
$env:MIN_ODDS = "1.5"
$env:MAX_ODDS = "3.0"
$env:HEADLESS = "1"
$env:SCRAPE_DELAY_MS = "2000"
$env:MAX_RETRIES = "3"

# This mode intentionally creates records labelled as a demonstration scenario.
$env:TARGET_HIT_RATE = "60"
$env:TARGET_YIELD = "11"
$env:MAX_WIN_STREAK = "12"
$env:MAX_LOSS_STREAK = "6"

Write-Output "[$(Get-Date -Format s)] START scrape:missing"
npm run scrape:missing
if ($LASTEXITCODE -ne 0) {
  throw "npm run scrape:missing failed with exit code $LASTEXITCODE"
}

Write-Output "[$(Get-Date -Format s)] START prepare"
npm run prepare
if ($LASTEXITCODE -ne 0) {
  throw "npm run prepare failed with exit code $LASTEXITCODE"
}

Write-Output "[$(Get-Date -Format s)] START export-sql"
npm run export-sql
if ($LASTEXITCODE -ne 0) {
  throw "npm run export-sql failed with exit code $LASTEXITCODE"
}

Write-Output "[$(Get-Date -Format s)] DONE"
