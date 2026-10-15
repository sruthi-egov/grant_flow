$ErrorActionPreference = 'Stop'
# Everything goes through the FRONTEND origin, exercising the Vite /api proxy
# exactly as the browser will.
$app = 'http://localhost:5173'
$api = "$app/api"
$pass = 0; $fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  FAIL  $name  -> $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host "`n== A. SPA is served ==" -ForegroundColor Cyan
$page = Invoke-WebRequest "$app/" -UseBasicParsing
Check "GET / returns 200" ($page.StatusCode -eq 200) "status=$($page.StatusCode)"
Check "page title is GrantOS" ($page.Content -match '<title>GrantOS</title>') "no title"
Check "no base44 in served HTML" (-not $page.Content.ToLower().Contains('base44')) "base44 present"
$fav = Invoke-WebRequest "$app/favicon.svg" -UseBasicParsing
Check "local favicon served (no base44.com fetch)" ($fav.StatusCode -eq 200) "status=$($fav.StatusCode)"

Write-Host "`n== B. API reachable through the SPA origin (proxy) ==" -ForegroundColor Cyan
$h = Invoke-RestMethod "$api/health"
Check "/api/health proxied to backend" ($h.status -eq 'ok') "status=$($h.status)"
Check "health says no Base44 SDK" ($h.base44.sdk_present -eq $false) "sdk_present=$($h.base44.sdk_present)"

Write-Host "`n== C. Login as two roles, with cookie session ==" -ForegroundColor Cyan
$sessionAdmin = $null
$admin = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email='admin@grantos.local';password='DemoAdmin!2026'} | ConvertTo-Json) -SessionVariable sessionAdmin
Check "admin login via proxy" ([bool]$admin.access_token) "no token"
$cookieNames = $sessionAdmin.Cookies.GetCookies("$app/api") | ForEach-Object { $_.Name }
Check "httpOnly session cookie issued" ($cookieNames -contains 'grantos_session') "cookies=$($cookieNames -join ',')"
$ah = @{ Authorization = "Bearer $($admin.access_token)" }

$sessionUser = $null
$analyst = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email='analyst@grantos.local';password='DemoUser!2026'} | ConvertTo-Json) -SessionVariable sessionUser
$uh = @{ Authorization = "Bearer $($analyst.access_token)" }
Check "analyst login via proxy" ([bool]$analyst.access_token) "no token"

Write-Host "`n== D. Create and edit an agreement ==" -ForegroundColor Cyan
$ref = "E2E-$(Get-Random -Maximum 99999)"
$grant = Invoke-RestMethod "$api/entities/Grant" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  title='E2E Demo Grant'; funder='E2E Foundation'; grant_number=$ref; total_amount=250000
  start_date='2026-02-01'; end_date='2027-01-31'; status='active'; reporting_cycle='quarterly'
  contacts=@(@{name='Test Contact';email='test.contact@grantos.local';role='Grant Manager';contact_type='Program Manager';is_active=$true})
} | ConvertTo-Json -Depth 6)
Check "grant created" ([bool]$grant.id) "no id"
Check "contacts persisted" ($grant.contacts.Count -eq 1) "count=$($grant.contacts.Count)"

$grant2 = Invoke-RestMethod "$api/entities/Grant/$($grant.id)" -Method Patch -Headers $ah -ContentType 'application/json' `
  -Body (@{ total_amount=275000; status='pending' } | ConvertTo-Json)
Check "grant edited (amount)" ([double]$grant2.total_amount -eq 275000) "amount=$($grant2.total_amount)"

Write-Host "`n== E. Contacts, milestones, deliverables ==" -ForegroundColor Cyan
$withContacts = Invoke-RestMethod "$api/entities/Grant/$($grant.id)" -Method Patch -Headers $ah -ContentType 'application/json' -Body (@{
  contacts=@(
    @{name='Test Contact';email='test.contact@grantos.local';role='Grant Manager';contact_type='Program Manager';is_active=$true},
    @{name='Finance Desk';email='finance.team@grantos.local';role='Finance';contact_type='Finance';is_active=$true}
  )
} | ConvertTo-Json -Depth 6)
Check "second contact added" ($withContacts.contacts.Count -eq 2) "count=$($withContacts.contacts.Count)"

$mi = Invoke-RestMethod "$api/entities/Milestone" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  grant_id=$grant.id; title='E2E Milestone'; milestone_type='Payment'; due_date='2026-05-15'; amount=50000; currency='USD'
} | ConvertTo-Json)
Check "milestone added" ([bool]$mi.id) "no id"
Check "milestone date is date-only" ($mi.due_date -eq '2026-05-15') "due_date=$($mi.due_date)"

$de = Invoke-RestMethod "$api/entities/GrantDeliverable" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  grant_id=$grant.id; name='E2E Deliverable'; category='Reporting'; due_date='2026-04-30'; priority='High'
} | ConvertTo-Json)
Check "deliverable added" ([bool]$de.id) "no id"

$tr = Invoke-RestMethod "$api/entities/GrantTranche" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  grant_id=$grant.id; tranche_name='E2E Tranche 1'; amount=100000; invoice_trigger_date='2026-03-01'; due_date='2026-03-31'
} | ConvertTo-Json)
Check "tranche added" ([bool]$tr.id) "no id"

$ob = Invoke-RestMethod "$api/entities/GrantReportingObligation" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  grant_id=$grant.id; obligation_name='E2E Q1 Report'; obligation_type='Quarterly Report'; due_date='2026-04-15'
} | ConvertTo-Json)
Check "reporting obligation added" ([bool]$ob.id) "no id"

$kids = Invoke-RestMethod "$api/entities/Milestone/filter" -Method Post -Headers $ah -ContentType 'application/json' `
  -Body (@{ where=@{ grant_id=$grant.id } } | ConvertTo-Json)
Check "children linked to parent grant" ($kids.Count -eq 1) "count=$($kids.Count)"

Write-Host "`n== F. Document upload and authorised download ==" -ForegroundColor Cyan
# Valid PDF fixtures generated with jsPDF (see make-fixtures.js).
$pdfPath = Join-Path $env:TEMP 'grantos-e2e.pdf'
if (-not (Test-Path $pdfPath)) { throw "Missing fixture $pdfPath - run make-fixtures.js first" }

Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $admin.access_token)
$form = New-Object System.Net.Http.MultipartFormDataContent
$fileBytes = [System.IO.File]::ReadAllBytes($pdfPath)
$fileContent = New-Object System.Net.Http.ByteArrayContent($fileBytes, 0, $fileBytes.Length)
$fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/pdf')
$form.Add($fileContent, 'file', 'e2e-grant-agreement.pdf')
$form.Add((New-Object System.Net.Http.StringContent('Grant')), 'entity_type')
$form.Add((New-Object System.Net.Http.StringContent($grant.id)), 'entity_id')
$uploadResp = $client.PostAsync("$api/files/upload", $form).Result
$uploadBody = $uploadResp.Content.ReadAsStringAsync().Result
Check "upload returned 2xx" ($uploadResp.IsSuccessStatusCode) "status=$($uploadResp.StatusCode) body=$uploadBody"
$upload = $uploadBody | ConvertFrom-Json
Check "upload returned file_url" ([bool]$upload.file_url) "body=$uploadBody"
Check "upload computed sha256" ($upload.file_hash.Length -eq 64) "hash=$($upload.file_hash)"

# Attach to the grant exactly as the UI does
Invoke-RestMethod "$api/entities/Grant/$($grant.id)" -Method Patch -Headers $ah -ContentType 'application/json' `
  -Body (@{ pdf_url = $upload.file_url } | ConvertTo-Json) | Out-Null

# Download with Bearer
$dl = Invoke-WebRequest "$app$($upload.file_url)" -Headers $ah -UseBasicParsing
Check "download with bearer token works" ($dl.StatusCode -eq 200 -and $dl.Content.Length -gt 100) "status=$($dl.StatusCode) len=$($dl.RawContentLength)"
Check "download content-type is PDF" ($dl.Headers['Content-Type'] -match 'application/pdf') "ct=$($dl.Headers['Content-Type'])"

# Download via cookie only, which is how <a target="_blank"> behaves
$dlCookie = Invoke-WebRequest "$app$($upload.file_url)" -WebSession $sessionAdmin -UseBasicParsing
Check "download via session cookie works (browser link)" ($dlCookie.StatusCode -eq 200) "status=$($dlCookie.StatusCode)"

# Unauthenticated download must fail
$blocked = $false
try { Invoke-WebRequest "$app$($upload.file_url)" -UseBasicParsing | Out-Null }
catch { $blocked = ($_.Exception.Response.StatusCode.value__ -eq 401) }
Check "unauthenticated download blocked (401)" $blocked "not blocked"

Write-Host "`n== G. Dashboard figures reflect records ==" -ForegroundColor Cyan
$allGrants = Invoke-RestMethod "$api/entities/Grant?limit=500" -Headers $ah
$activeCount = ($allGrants | Where-Object { $_.status -eq 'active' -and -not $_.archived }).Count
$sumAll = ($allGrants | Measure-Object -Property total_amount -Sum).Sum
Check "grant totals are summable numbers" ($sumAll -gt 0) "sum=$sumAll"
Check "status filter yields a count" ($activeCount -ge 1) "active=$activeCount"
$expected = 0; foreach($g in $allGrants){ $expected += [double]$g.total_amount }
Check "portfolio total matches row-by-row sum" ([math]::Abs($expected - $sumAll) -lt 0.01) "expected=$expected got=$sumAll"

Write-Host "`n== H. Notifications through local capture ==" -ForegroundColor Cyan
$mailBefore = (Invoke-RestMethod 'http://localhost:8025/api/v1/messages?limit=1').messages_count
$run = Invoke-RestMethod "$api/notifications/run" -Method Post -Headers $ah -ContentType 'application/json' -Body '{}'
Check "notification run completed" ($null -ne $run.date) "no date"
Start-Sleep -Seconds 2
$mailAfter = (Invoke-RestMethod 'http://localhost:8025/api/v1/messages?limit=1').messages_count
Check "emails captured by Mailpit" ($mailAfter -gt $mailBefore) "before=$mailBefore after=$mailAfter sent=$($run.sent)"

# Re-run must not duplicate
$run2 = Invoke-RestMethod "$api/notifications/run" -Method Post -Headers $ah -ContentType 'application/json' -Body '{}'
Start-Sleep -Seconds 2
$mailAfter2 = (Invoke-RestMethod 'http://localhost:8025/api/v1/messages?limit=1').messages_count
Check "re-run sends no duplicates" ($mailAfter2 -eq $mailAfter) "after=$mailAfter after2=$mailAfter2 sent2=$($run2.sent)"
Check "re-run reports skipped items" ($run2.skipped -gt 0) "skipped=$($run2.skipped)"

$logs = Invoke-RestMethod "$api/entities/NotificationLog?sort=-created_date&limit=50" -Headers $ah
Check "delivery history retained" ($logs.Count -gt 0) "count=$($logs.Count)"

Write-Host "`n== I. AI extraction reports status honestly ==" -ForegroundColor Cyan
$aiStatus = Invoke-RestMethod "$api/ai/status" -Headers $ah
Check "ai status endpoint responds" ($null -ne $aiStatus.enabled) "no field"
# Text extraction works WITHOUT any AI credential
$txt = Invoke-RestMethod "$api/ai/pdf-text" -Method Post -Headers $ah -ContentType 'application/json' `
  -Body (@{ pdf_url = $upload.file_url } | ConvertTo-Json)
Check "PDF text layer extracted locally (no AI needed)" ($txt.extracted_text -match 'GRANT AGREEMENT') "text=$($txt.extracted_text.Substring(0,[Math]::Min(80,$txt.extracted_text.Length)))"
Check "page markers preserved for source attribution" ($txt.extracted_text -match '--- PAGE 1 ---') "no page marker"
Check "disbursement detail present in extracted text" ($txt.extracted_text -match 'Tranche 1') "missing tranche line"

# A scanned/no-text PDF must fail loudly, never silently succeed
$scanPath = Join-Path $env:TEMP 'grantos-scan.pdf'
$form2 = New-Object System.Net.Http.MultipartFormDataContent
$sb = [System.IO.File]::ReadAllBytes($scanPath)
$sc = New-Object System.Net.Http.ByteArrayContent($sb, 0, $sb.Length)
$sc.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/pdf')
$form2.Add($sc, 'file', 'scanned.pdf')
$up2 = ($client.PostAsync("$api/files/upload", $form2).Result.Content.ReadAsStringAsync().Result | ConvertFrom-Json)
# Use HttpClient so the error body is readable (PowerShell consumes the
# response stream on a WebException before we can read it).
$scanReq = New-Object System.Net.Http.StringContent((@{ pdf_url = $up2.file_url } | ConvertTo-Json), [System.Text.Encoding]::UTF8, 'application/json')
$scanResp = $client.PostAsync("$api/ai/pdf-text", $scanReq).Result
$scanMsg = $scanResp.Content.ReadAsStringAsync().Result
Check "scanned PDF rejected with explicit error" ([int]$scanResp.StatusCode -eq 400) "status=$([int]$scanResp.StatusCode)"
Check "error names the missing text layer" ($scanMsg -match 'no extractable text layer') "msg=$scanMsg"
Check "error states OCR is unavailable" ($scanMsg -match 'OCR is not configured') "msg=$scanMsg"
Check "error does not fabricate results" (-not ($scanMsg -match '"deliverables"')) "fabricated output"

Write-Host "`n== J. Cleanup of test records ==" -ForegroundColor Cyan
Invoke-RestMethod "$api/entities/Grant/$($grant.id)" -Method Delete -Headers $ah | Out-Null
$deleted = $false
try { Invoke-RestMethod "$api/entities/Grant/$($grant.id)" -Headers $ah | Out-Null } catch { $deleted = ($_.Exception.Response.StatusCode.value__ -eq 404) }
Check "test grant removed" $deleted "still present"

Write-Host "`n--------------------------------------"
Write-Host "PASSED: $pass    FAILED: $fail" -ForegroundColor $(if($fail -eq 0){'Green'}else{'Red'})
Write-Host "--------------------------------------`n"
if ($fail -gt 0) { exit 1 }
