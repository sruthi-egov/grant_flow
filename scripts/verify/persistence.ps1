$ErrorActionPreference = 'Stop'
$root = 'C:\Users\sruz\Project\venu\GrantOS\GrantOSBase44'
$api  = 'http://localhost:3001/api'
$pass = 0; $fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  FAIL  $name  -> $detail" -ForegroundColor Red; $script:fail++ }
}

function Login { (Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email='admin@grantos.local';password='DemoAdmin!2026'} | ConvertTo-Json)).access_token }

Write-Host "`n== Create a record and upload a document ==" -ForegroundColor Cyan
$token = Login
$ah = @{ Authorization = "Bearer $token" }

$marker = "PERSIST-$(Get-Random -Maximum 999999)"
$grant = Invoke-RestMethod "$api/entities/Grant" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  title = "Persistence Check $marker"; funder = 'Restart Test'; grant_number = $marker
  total_amount = 42000; start_date = '2026-01-01'; end_date = '2026-12-31'
} | ConvertTo-Json)
Check "grant created before restart" ([bool]$grant.id) "no id"

Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $token)
$form = New-Object System.Net.Http.MultipartFormDataContent
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $env:TEMP 'grantos-e2e.pdf'))
$fc = New-Object System.Net.Http.ByteArrayContent($bytes, 0, $bytes.Length)
$fc.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/pdf')
$form.Add($fc, 'file', "persist-$marker.pdf")
$form.Add((New-Object System.Net.Http.StringContent('Grant')), 'entity_type')
$form.Add((New-Object System.Net.Http.StringContent($grant.id)), 'entity_id')
$upload = ($client.PostAsync("$api/files/upload", $form).Result.Content.ReadAsStringAsync().Result | ConvertFrom-Json)
Check "document uploaded before restart" ([bool]$upload.file_url) "no file_url"

$grantsBefore = (Invoke-RestMethod "$api/entities/Grant?limit=500" -Headers $ah).Count
$hashBefore = $upload.file_hash

Write-Host "`n== Restart: stop containers and API, then bring them back ==" -ForegroundColor Cyan
Set-Location $root
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { try { (Get-Process -Id $_.OwningProcess).Kill() } catch {} }

# `down` without -v keeps the named volumes; this is the real test.
# docker writes progress to stderr, which $ErrorActionPreference='Stop' would
# otherwise treat as fatal, so run these through cmd.
cmd /c "docker compose down >nul 2>&1"
Write-Host "  containers stopped"
cmd /c "docker compose up -d >nul 2>&1"

$dbReady = $false
for ($i = 0; $i -lt 40; $i++) {
  $state = (cmd /c "docker inspect --format `"{{.State.Health.Status}}`" grantos-postgres 2>nul")
  if ($state -eq 'healthy') { $dbReady = $true; break }
  Start-Sleep -Seconds 2
}
Check "postgres came back healthy" $dbReady "not healthy"

Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory "$root\backend" `
  -RedirectStandardOutput "$root\.backend.log" -RedirectStandardError "$root\.backend.err.log" -WindowStyle Hidden | Out-Null

$apiReady = $false
for ($i = 0; $i -lt 40; $i++) {
  try { Invoke-RestMethod "$api/health/live" -TimeoutSec 2 | Out-Null; $apiReady = $true; break }
  catch { Start-Sleep -Seconds 1 }
}
Check "API came back up" $apiReady "not reachable"

Write-Host "`n== Verify everything survived ==" -ForegroundColor Cyan
$token2 = Login
$ah2 = @{ Authorization = "Bearer $token2" }
Check "can sign in after restart" ([bool]$token2) "login failed"

$found = Invoke-RestMethod "$api/entities/Grant/filter" -Method Post -Headers $ah2 -ContentType 'application/json' `
  -Body (@{ where = @{ grant_number = $marker } } | ConvertTo-Json)
Check "grant survived the restart" ($found.Count -eq 1) "count=$($found.Count)"
Check "field values intact" ([double]$found[0].total_amount -eq 42000) "amount=$($found[0].total_amount)"
Check "date values intact" ($found[0].start_date -eq '2026-01-01') "start=$($found[0].start_date)"

$grantsAfter = (Invoke-RestMethod "$api/entities/Grant?limit=500" -Headers $ah2).Count
Check "no records lost" ($grantsAfter -eq $grantsBefore) "before=$grantsBefore after=$grantsAfter"

$dl = Invoke-WebRequest "http://localhost:3001$($upload.file_url)" -Headers $ah2 -UseBasicParsing
Check "uploaded document still downloadable" ($dl.StatusCode -eq 200) "status=$($dl.StatusCode)"
Check "document bytes unchanged" ($dl.RawContentLength -eq $bytes.Length) "got=$($dl.RawContentLength) expected=$($bytes.Length)"

$meta = Invoke-RestMethod "$api/files/$($upload.file_id)" -Headers $ah2
Check "stored hash unchanged" ($meta.file_hash -eq $hashBefore) "hash drift"

$logs = Invoke-RestMethod "$api/entities/NotificationLog?limit=10" -Headers $ah2
Check "notification history survived" ($logs.Count -gt 0) "count=$($logs.Count)"

Write-Host "`n== Clean up the persistence test record ==" -ForegroundColor Cyan
Invoke-RestMethod "$api/entities/Grant/$($grant.id)" -Method Delete -Headers $ah2 | Out-Null
Check "test record removed" $true ""

Write-Host "`n--------------------------------------"
Write-Host "PASSED: $pass    FAILED: $fail" -ForegroundColor $(if($fail -eq 0){'Green'}else{'Red'})
Write-Host "--------------------------------------`n"
if ($fail -gt 0) { exit 1 }
