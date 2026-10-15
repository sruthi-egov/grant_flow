$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001/api'
$pass = 0; $fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  FAIL  $name  -> $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host "`n== 1. Authentication ==" -ForegroundColor Cyan

# Wrong password must be rejected
$rejected = $false
try { Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email='admin@grantos.local';password='wrong'} | ConvertTo-Json) | Out-Null }
catch { $rejected = ($_.Exception.Response.StatusCode.value__ -eq 401) }
Check "bad password rejected with 401" $rejected "no 401"

# Unauthenticated access must be rejected
$blocked = $false
try { Invoke-RestMethod "$base/entities/Grant" | Out-Null } catch { $blocked = ($_.Exception.Response.StatusCode.value__ -eq 401) }
Check "unauthenticated entity read blocked" $blocked "not blocked"

$admin = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email='admin@grantos.local';password='DemoAdmin!2026'} | ConvertTo-Json)
Check "admin login returns access token" ([bool]$admin.access_token) "no token"
$ah = @{ Authorization = "Bearer $($admin.access_token)" }

$user = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email='analyst@grantos.local';password='DemoUser!2026'} | ConvertTo-Json)
$uh = @{ Authorization = "Bearer $($user.access_token)" }
Check "analyst login returns access token" ([bool]$user.access_token) "no token"

$me = Invoke-RestMethod "$base/auth/me" -Headers $ah
Check "GET /auth/me returns admin role" ($me.role -eq 'admin') "role=$($me.role)"

$perms = Invoke-RestMethod "$base/auth/permissions" -Headers $uh
Check "analyst permissions restricted to Grants+MOUs" ((($perms.allowed_modules) -join ',') -eq 'Grants,MOUs') "got $($perms.allowed_modules -join ',')"

Write-Host "`n== 2. Entity reads, sorting, filtering ==" -ForegroundColor Cyan
$grants = Invoke-RestMethod "$base/entities/Grant" -Headers $ah
Check "list Grant returns 3 seeded rows" ($grants.Count -eq 3) "count=$($grants.Count)"

$amt = ($grants | Where-Object { $_.grant_number -eq 'MDF-2025-0417' }).total_amount
Check "Decimal serialised as number not string" ($amt -isnot [string]) "type=$($amt.GetType().Name)"
Check "total_amount value correct (1250000)" ([double]$amt -eq 1250000) "val=$amt"

$g = $grants | Where-Object { $_.grant_number -eq 'MDF-2025-0417' }
Check "date-only field is YYYY-MM-DD" ($g.start_date -match '^\d{4}-\d{2}-\d{2}$') "start_date=$($g.start_date)"
Check "contacts JSON round-trips as array" ($g.contacts.Count -eq 3) "contacts=$($g.contacts.Count)"

$sorted = Invoke-RestMethod "$base/entities/Milestone?sort=due_date&limit=100" -Headers $ah
$dates = $sorted | ForEach-Object { $_.due_date }
Check "sort=due_date ascending honoured" (($dates | Sort-Object) -join ',') -eq ($dates -join ',')
$sorted2 = Invoke-RestMethod "$base/entities/Milestone?sort=-due_date&limit=100" -Headers $ah
Check "sort=-due_date descending honoured" ($sorted2[0].due_date -ge $sorted2[-1].due_date) "first=$($sorted2[0].due_date)"

$filtered = Invoke-RestMethod "$base/entities/Milestone/filter" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{ where = @{ grant_id = $g.id } } | ConvertTo-Json)
Check "filter by grant_id returns 4 milestones" ($filtered.Count -eq 4) "count=$($filtered.Count)"

$inFilter = Invoke-RestMethod "$base/entities/Milestone/filter" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{ where = @{ status = @{ '$in' = @('pending') } } } | ConvertTo-Json -Depth 5)
Check "`$in operator works" ($inFilter.Count -ge 1) "count=$($inFilter.Count)"

$badField = $false
try { Invoke-RestMethod "$base/entities/Grant/filter" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{ where = @{ nope = 1 } } | ConvertTo-Json) | Out-Null }
catch { $badField = ($_.Exception.Response.StatusCode.value__ -eq 400) }
Check "unknown filter field rejected with 400" $badField "not rejected"

Write-Host "`n== 3. Role-based access control ==" -ForegroundColor Cyan
$denied = $false
try { Invoke-RestMethod "$base/entities/Grant/$($g.id)" -Method Patch -Headers $uh -ContentType 'application/json' -Body (@{title='hacked'} | ConvertTo-Json) | Out-Null }
catch { $denied = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Check "analyst cannot update a Grant (403)" $denied "not denied"

$modDenied = $false
try { Invoke-RestMethod "$base/entities/SOW" -Headers $uh | Out-Null } catch { $modDenied = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Check "analyst blocked from SOWs module (403)" $modDenied "not denied"

$mouOk = $true
try { Invoke-RestMethod "$base/entities/MOU" -Headers $uh | Out-Null } catch { $mouOk = $false }
Check "analyst allowed MOUs module" $mouOk "blocked"

$adminOnly = $false
try { Invoke-RestMethod "$base/users" -Headers $uh | Out-Null } catch { $adminOnly = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Check "analyst cannot list users (403)" $adminOnly "not denied"

$redacted = Invoke-RestMethod "$base/entities/AppSettings" -Headers $uh
Check "alert_emails redacted for non-admin" ($redacted[0].alert_emails.Count -eq 0) "leaked $($redacted[0].alert_emails -join ',')"
$full = Invoke-RestMethod "$base/entities/AppSettings" -Headers $ah
Check "alert_emails visible to admin" ($full[0].alert_emails.Count -eq 2) "count=$($full[0].alert_emails.Count)"

Write-Host "`n== 4. Create / edit / relationships ==" -ForegroundColor Cyan
$newGrant = Invoke-RestMethod "$base/entities/Grant" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  title='Smoke Test Grant'; funder='Test Funder'; grant_number="ST-$(Get-Random)"; total_amount=90000;
  start_date='2026-01-01'; end_date='2026-12-31'; status='active'
} | ConvertTo-Json)
Check "create Grant returns id" ([bool]$newGrant.id) "no id"
Check "created_by stamped from token" ($newGrant.created_by -eq 'admin@grantos.local') "created_by=$($newGrant.created_by)"
Check "numeric field correct on create" ([double]$newGrant.total_amount -eq 90000) "val=$($newGrant.total_amount)"

$edited = Invoke-RestMethod "$base/entities/Grant/$($newGrant.id)" -Method Patch -Headers $ah -ContentType 'application/json' -Body (@{ title='Smoke Test Grant (edited)'; status='pending' } | ConvertTo-Json)
Check "edit Grant persists title" ($edited.title -eq 'Smoke Test Grant (edited)') "title=$($edited.title)"
Check "edit Grant persists enum" ($edited.status -eq 'pending') "status=$($edited.status)"

$ms = Invoke-RestMethod "$base/entities/Milestone" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  grant_id=$newGrant.id; title='Smoke milestone'; due_date='2026-06-30'; amount=1000; milestone_type='Payment'
} | ConvertTo-Json)
Check "child milestone created under grant" ($ms.grant_id -eq $newGrant.id) "grant_id=$($ms.grant_id)"

$fkRejected = $false
try { Invoke-RestMethod "$base/entities/Milestone" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{ grant_id='00000000-0000-4000-8000-000000000999'; title='orphan' } | ConvertTo-Json) | Out-Null }
catch { $fkRejected = ($_.Exception.Response.StatusCode.value__ -eq 400) }
Check "orphan child rejected (FK enforced)" $fkRejected "not rejected"

$badEnum = $false
try { Invoke-RestMethod "$base/entities/Grant" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{ title='x'; status='not_a_status' } | ConvertTo-Json) | Out-Null }
catch { $badEnum = ($_.Exception.Response.StatusCode.value__ -eq 400) }
Check "invalid enum rejected (400)" $badEnum "not rejected"

# Cascade: deleting the grant must remove its milestone
Invoke-RestMethod "$base/entities/Grant/$($newGrant.id)" -Method Delete -Headers $ah | Out-Null
$gone = $false
try { Invoke-RestMethod "$base/entities/Milestone/$($ms.id)" -Headers $ah | Out-Null } catch { $gone = ($_.Exception.Response.StatusCode.value__ -eq 404) }
Check "cascade delete removed child milestone" $gone "child survived"

Write-Host "`n== 5. Audit trail ==" -ForegroundColor Cyan
$audit = Invoke-RestMethod "$base/entities/AuditLog?sort=-created_date&limit=20" -Headers $ah
Check "audit entries written for CRUD" ($audit.Count -ge 3) "count=$($audit.Count)"
Check "audit records acting user" (($audit | Where-Object { $_.user_email -eq 'admin@grantos.local' }).Count -ge 1) "no user_email"

Write-Host "`n== 6. Health & Base44 independence ==" -ForegroundColor Cyan
$h = Invoke-RestMethod "$base/health"
Check "health reports database ok" ($h.dependencies.database.status -eq 'ok') "db=$($h.dependencies.database.status)"
Check "health reports no Base44 SDK" ($h.base44.sdk_present -eq $false) "sdk_present true"

Write-Host "`n--------------------------------------"
Write-Host "PASSED: $pass    FAILED: $fail" -ForegroundColor $(if($fail -eq 0){'Green'}else{'Red'})
Write-Host "--------------------------------------`n"
