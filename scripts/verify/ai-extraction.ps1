$ErrorActionPreference = 'Stop'
$api = 'http://127.0.0.1:3001/api'

$tok = (Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email='admin@grantos.local';password='DemoAdmin!2026'} | ConvertTo-Json)).access_token
$ah = @{ Authorization = "Bearer $tok" }

Write-Host "`n== AI status ==" -ForegroundColor Cyan
Invoke-RestMethod "$api/ai/status" -Headers $ah | Format-List

# Upload the text-layer fixture against the seeded demo grant.
$grant = (Invoke-RestMethod "$api/entities/Grant/filter" -Method Post -Headers $ah -ContentType 'application/json' `
  -Body (@{ where = @{ grant_number = 'MDF-2025-0417' } } | ConvertTo-Json))[0]
Write-Host "Target grant: $($grant.title)" -ForegroundColor DarkGray

Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromMinutes(3)
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $tok)

$form = New-Object System.Net.Http.MultipartFormDataContent
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $env:TEMP 'grantos-e2e.pdf'))
$fc = New-Object System.Net.Http.ByteArrayContent($bytes, 0, $bytes.Length)
$fc.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/pdf')
$form.Add($fc, 'file', 'ai-extraction-test.pdf')
$form.Add((New-Object System.Net.Http.StringContent('Grant')), 'entity_type')
$form.Add((New-Object System.Net.Http.StringContent($grant.id)), 'entity_id')
$upload = ($client.PostAsync("$api/files/upload", $form).Result.Content.ReadAsStringAsync().Result | ConvertFrom-Json)
Write-Host "Uploaded: $($upload.file_url)" -ForegroundColor DarkGray

Write-Host "`n== Calling the real extraction endpoint ==" -ForegroundColor Cyan
$payload = @{
  pdf_url  = $upload.file_url
  parent_type = 'grant'
  parent_id   = $grant.id
  extract_type = 'both'
  existing_deliverables = @()
  existing_milestones   = @()
} | ConvertTo-Json -Depth 5

$req = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, 'application/json')
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$resp = $client.PostAsync("$api/extraction/extractDeliverablesAndMilestones", $req).Result
$sw.Stop()
$bodyText = $resp.Content.ReadAsStringAsync().Result

Write-Host "HTTP $([int]$resp.StatusCode) in $([math]::Round($sw.Elapsed.TotalSeconds,1))s" -ForegroundColor Yellow

if (-not $resp.IsSuccessStatusCode) {
  Write-Host "`nRESPONSE BODY:" -ForegroundColor Red
  $bodyText
  exit 1
}

$result = $bodyText | ConvertFrom-Json
Write-Host "`nextraction_method : $($result.extraction_method)"
Write-Host "deliverables      : $($result.deliverables.Count)"
Write-Host "milestones        : $($result.milestones.Count)"
Write-Host "currency          : $($result.currency)"
Write-Host "total_value       : $($result.total_contract_value)"
Write-Host "notes             : $($result.extraction_notes)"

Write-Host "`n--- DELIVERABLES ---" -ForegroundColor Cyan
$result.deliverables | ForEach-Object {
  "  * {0}`n      category={1}  due={2}  conf={3}  section={4}" -f $_.title, $_.category, $_.due_date, $_.confidence, $_.source_section
}

Write-Host "`n--- MILESTONES ---" -ForegroundColor Cyan
$result.milestones | ForEach-Object {
  "  * {0}`n      type={1}  due={2}  amount={3} {4}  conf={5}  section={6}" -f $_.title, $_.milestone_type, $_.due_date, $_.currency, $_.amount, $_.confidence, $_.source_section
}

# Clean up the uploaded test document.
Invoke-RestMethod "$api/files/$($upload.file_id)" -Method Delete -Headers $ah | Out-Null
Write-Host "`n(test document removed)" -ForegroundColor DarkGray
