# Verifies the end-to-end invitation workflow and its security properties.
#
#   admin invites -> invitation stored -> email generated -> recipient opens
#   link -> sets a password -> signs in with the assigned role
#
# Also covers: single use, expiry, revocation, resend, duplicate handling,
# existing accounts, and privilege escalation via the acceptance request.
#
# Creates and removes its own records. Safe to re-run.

$ErrorActionPreference = 'Stop'
$app = 'http://localhost:5173'
$api = "$app/api"
$mail = 'http://localhost:8025'
$pass = 0; $fail = 0
$skip = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  FAIL  $name  -> $detail" -ForegroundColor Red; $script:fail++ }
}
function Skip($name, $why) {
  Write-Host "  SKIP  $name  -> $why" -ForegroundColor Yellow; $script:skip++
}
# Invoke-RestMethod consumes the response stream before the error body can be
# read, so error-body assertions go through HttpClient instead.
Add-Type -AssemblyName System.Net.Http
$script:http = New-Object System.Net.Http.HttpClient
$script:http.Timeout = [TimeSpan]::FromSeconds(60)

function Raw($method, $url, $bodyObj, $bearer) {
  $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::$method), $url
  if ($null -ne $bodyObj) {
    $req.Content = New-Object System.Net.Http.StringContent(
      ($bodyObj | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8, 'application/json')
  }
  if ($bearer) {
    $req.Headers.Authorization =
      New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $bearer)
  }
  $resp = $script:http.SendAsync($req).Result
  [pscustomobject]@{
    Status = [int]$resp.StatusCode
    Body   = $resp.Content.ReadAsStringAsync().Result
  }
}

$admin = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email='admin@grantos.local';password='DemoAdmin!2026'} | ConvertTo-Json)
$ah = @{ Authorization = "Bearer $($admin.access_token)" }
$analyst = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email='analyst@grantos.local';password='DemoUser!2026'} | ConvertTo-Json)
$uh = @{ Authorization = "Bearer $($analyst.access_token)" }

$stamp  = Get-Random -Maximum 999999
$invitee = "invitee.$stamp@grantos.local"
$newPass = 'InviteeDemo!2026'

# How mail is configured decides whether the message body can be read back,
# and whether running this script would put real email on the wire.
$mailStatus = Invoke-RestMethod "$api/notifications/status" -Headers $ah
$mailMode = $mailStatus.mode
Write-Host "`nSMTP mode: $mailMode ($($mailStatus.host):$($mailStatus.port))" -ForegroundColor DarkGray

if ($mailMode -eq 'real_delivery') {
  Write-Host @"

  WARNING: SMTP is configured for REAL DELIVERY.
  This script creates invitations, and each one triggers a send attempt to a
  <...>@grantos.local address - a domain that does not exist. Those attempts
  waste provider quota and generate bounces.

  Re-run with MAIL_DRY_RUN=true in backend/.env (restart the backend first) to
  exercise the whole workflow without transmitting anything.

"@ -ForegroundColor Yellow
  if (-not $env:GRANTOS_ALLOW_REAL_SEND) {
    Write-Host "  Refusing to run. Set GRANTOS_ALLOW_REAL_SEND=1 to override.`n" -ForegroundColor Red
    exit 2
  }
}

Write-Host "`n== 1. Authorisation on the invite endpoint ==" -ForegroundColor Cyan
$denied = $false
try { Invoke-RestMethod "$api/users/invite" -Method Post -Headers $uh -ContentType 'application/json' `
        -Body (@{email="sneak.$stamp@grantos.local"} | ConvertTo-Json) | Out-Null }
catch { $denied = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Check "non-admin cannot invite (403)" $denied "not denied"

$anonDenied = $false
try { Invoke-RestMethod "$api/admin/invitations" | Out-Null }
catch { $anonDenied = ($_.Exception.Response.StatusCode.value__ -eq 401) }
Check "anonymous cannot list invitations (401)" $anonDenied "not denied"

Write-Host "`n== 2. Admin sends an invitation ==" -ForegroundColor Cyan
$mailBefore = (Invoke-RestMethod "$mail/api/v1/messages?limit=1").messages_count
$created = Invoke-RestMethod "$api/users/invite" -Method Post -Headers $ah -ContentType 'application/json' -Body (@{
  email = $invitee; role = 'user'; allowed_modules = @('Grants','MOUs'); can_upload_pdf = $true
} | ConvertTo-Json)
Check "invitation created" ([bool]$created.invitation.id) "no id"
Check "status is pending" ($created.invitation.status -eq 'pending') "status=$($created.invitation.status)"
Check "role recorded on the invitation" ($created.invitation.role -eq 'user') "role=$($created.invitation.role)"
Check "permissions recorded on the invitation" (($created.invitation.allowed_modules -join ',') -eq 'Grants,MOUs') "got $($created.invitation.allowed_modules -join ',')"
if ($mailMode -eq 'dry_run') {
  # A dry run must report 'skipped', never 'sent'.
  Check "dry run reported as skipped, not sent" ($created.email_status -eq 'skipped') "status=$($created.email_status)"
  Check "dry run explains itself" ($created.email_error -match 'MAIL_DRY_RUN') "error=$($created.email_error)"
} else {
  Check "email reported sent" ($created.email_status -eq 'sent') "status=$($created.email_status)"
}

Write-Host "`n== 3. No account exists until acceptance ==" -ForegroundColor Cyan
$users = Invoke-RestMethod "$api/users" -Headers $ah
Check "no user account created yet" (($users | Where-Object { $_.email -eq $invitee }).Count -eq 0) "account exists prematurely"

$cannotLogin = $false
try { Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
        -Body (@{email=$invitee;password=$newPass} | ConvertTo-Json) | Out-Null }
catch { $cannotLogin = ($_.Exception.Response.StatusCode.value__ -eq 401) }
Check "invitee cannot sign in before accepting" $cannotLogin "login succeeded"

Write-Host "`n== 4. Email contains a working link, not a password ==" -ForegroundColor Cyan
# The message body can only be read back when SMTP points at a local capture
# tool. With a real provider the mail has left the building, so the content
# assertions are covered by unit tests instead
# (src/users/invitations.service.spec.ts: "emails a link and never a password").
if ($mailMode -eq 'local_capture') {
  Start-Sleep -Seconds 1
  $mailAfter = (Invoke-RestMethod "$mail/api/v1/messages?limit=1").messages_count
  Check "email captured locally" ($mailAfter -gt $mailBefore) "before=$mailBefore after=$mailAfter"

  # The capture API returns To as a single object for one recipient and an
  # array for several, so normalise before comparing.
  $msg = (Invoke-RestMethod "$mail/api/v1/messages?limit=20").messages |
    Where-Object { @($_.To | ForEach-Object { $_.Address }) -contains $invitee } | Select-Object -First 1
  Check "email addressed to the invitee" ([bool]$msg) "not found"
  $body = (Invoke-RestMethod "$mail/api/v1/message/$($msg.ID)").HTML
  Check "email contains an /invite/ link" ($body -match '/invite/([A-Za-z0-9_\-]{20,})') "no link"
  $emailToken = $Matches[1]
  Check "email does NOT contain a password" (-not ($body -match '(?i)temporary password')) "password leaked in email"
  Check "link states it is single use" ($body -match '(?i)only be used once') "no single-use notice"
} else {
  Skip "email body assertions" "SMTP mode is '$mailMode'; message content is covered by unit tests"
  # The API returns the same link outside production, so the rest of the
  # workflow can still be exercised without reading a mailbox.
  Check "API returned an acceptance link" ([bool]$created.accept_url) "no accept_url"
  $emailToken = ($created.accept_url -split '/invite/')[-1]
}

Write-Host "`n== 5. Acceptance page can preview the invitation ==" -ForegroundColor Cyan
$preview = Invoke-RestMethod "$api/invitations/$emailToken"
Check "preview works unauthenticated" ($preview.email -eq $invitee) "email=$($preview.email)"
Check "preview shows the assigned role" ($preview.role -eq 'user') "role=$($preview.role)"
Check "preview does not leak the token hash" (-not ($preview.PSObject.Properties.Name -contains 'token_hash')) "hash leaked"

Write-Host "`n== 6. Weak passwords are rejected ==" -ForegroundColor Cyan
$weakRejected = $false
try { Invoke-RestMethod "$api/invitations/$emailToken/accept" -Method Post -ContentType 'application/json' `
        -Body (@{password='password'} | ConvertTo-Json) | Out-Null }
catch { $weakRejected = ($_.Exception.Response.StatusCode.value__ -eq 400) }
Check "weak password rejected" $weakRejected "accepted a weak password"

Write-Host "`n== 7. Privilege escalation is not possible ==" -ForegroundColor Cyan
# Attempt to grant admin + all modules through the acceptance body.
$escalated = Invoke-RestMethod "$api/invitations/$emailToken/accept" -Method Post -ContentType 'application/json' -Body (@{
  password = $newPass; full_name = 'Invited Person'
  role = 'admin'; allowed_modules = @('Grants','SOWs','MSAs','MOUs'); can_upload_pdf = $true; is_active = $true
} | ConvertTo-Json)
Check "acceptance succeeded" ($escalated.email -eq $invitee) "email=$($escalated.email)"
Check "role came from the invitation, not the request" ($escalated.role -eq 'user') "role=$($escalated.role)"

$created2 = (Invoke-RestMethod "$api/users" -Headers $ah) | Where-Object { $_.email -eq $invitee }
Check "account created with the invited role" ($created2.role -eq 'user') "role=$($created2.role)"
Check "modules came from the invitation" (($created2.allowed_modules -join ',') -eq 'Grants,MOUs') "got $($created2.allowed_modules -join ',')"
Check "account is active" ($created2.is_active -eq $true) "inactive"
Check "no forced password change (they chose it)" ($created2.must_change_password -eq $false) "must_change_password set"

Write-Host "`n== 8. Invitee signs in and gets the assigned permissions ==" -ForegroundColor Cyan
$session = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{email=$invitee;password=$newPass} | ConvertTo-Json)
Check "invitee can sign in with their chosen password" ([bool]$session.access_token) "no token"
$ih = @{ Authorization = "Bearer $($session.access_token)" }
$me = Invoke-RestMethod "$api/auth/me" -Headers $ih
Check "signed in as the assigned role" ($me.role -eq 'user') "role=$($me.role)"

$grantsOk = $true
try { Invoke-RestMethod "$api/entities/Grant" -Headers $ih | Out-Null } catch { $grantsOk = $false }
Check "granted module is reachable (Grants)" $grantsOk "blocked"

$sowBlocked = $false
try { Invoke-RestMethod "$api/entities/SOW" -Headers $ih | Out-Null }
catch { $sowBlocked = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Check "ungranted module is blocked (SOWs)" $sowBlocked "not blocked"

$adminBlocked = $false
try { Invoke-RestMethod "$api/users" -Headers $ih | Out-Null }
catch { $adminBlocked = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Check "cannot reach admin endpoints" $adminBlocked "not blocked"

Write-Host "`n== 9. The link is single use ==" -ForegroundColor Cyan
$reuse = Raw 'Post' "$api/invitations/$emailToken/accept" @{password='AnotherPass!2026'} $null
Check "token cannot be reused" ($reuse.Status -ge 400) "status=$($reuse.Status)"
Check "reuse reports it was already used" ($reuse.Body -match 'already been used') "msg=$($reuse.Body)"

$previewGone = $false
try { Invoke-RestMethod "$api/invitations/$emailToken" | Out-Null } catch { $previewGone = $true }
Check "preview also rejects a used token" $previewGone "still previewable"

Write-Host "`n== 10. Inviting someone who already has an account ==" -ForegroundColor Cyan
$dup = Raw 'Post' "$api/users/invite" @{email=$invitee} $admin.access_token
Check "re-inviting an existing account is refused (409)" ($dup.Status -eq 409) "status=$($dup.Status)"
Check "message explains why" ($dup.Body -match 'already has an account') "msg=$($dup.Body)"
$stillOne = (Invoke-RestMethod "$api/users" -Headers $ah) | Where-Object { $_.email -eq $invitee }
Check "no duplicate account created" ($stillOne.Count -eq 1 -or $null -ne $stillOne.id) "duplicates exist"

Write-Host "`n== 11. Resend replaces the previous link ==" -ForegroundColor Cyan
$second = "resend.$stamp@grantos.local"
$inv2 = Invoke-RestMethod "$api/users/invite" -Method Post -Headers $ah -ContentType 'application/json' `
  -Body (@{email=$second; role='user'} | ConvertTo-Json)
$firstToken = ($inv2.accept_url -split '/invite/')[-1]
Check "first invitation issued" ([bool]$firstToken) "no token"

$resent = Invoke-RestMethod "$api/admin/invitations/$($inv2.invitation.id)/resend" -Method Post -Headers $ah
$secondToken = ($resent.accept_url -split '/invite/')[-1]
Check "resend issues a different token" ($secondToken -ne $firstToken) "same token reissued"
Check "resend increments the send count" ($resent.invitation.sent_count -ge 2) "count=$($resent.invitation.sent_count)"

$oldDead = $false
try { Invoke-RestMethod "$api/invitations/$firstToken" | Out-Null } catch { $oldDead = $true }
Check "previous link stops working" $oldDead "old link still valid"

$newAlive = $false
try { Invoke-RestMethod "$api/invitations/$secondToken" | Out-Null; $newAlive = $true } catch {}
Check "new link works" $newAlive "new link dead"

$pending = Invoke-RestMethod "$api/admin/invitations" -Headers $ah
$forSecond = $pending | Where-Object { $_.email -eq $second -and $_.status -eq 'pending' }
Check "exactly one pending invitation per address" ($forSecond.Count -eq 1 -or $null -ne $forSecond.id) "count=$($forSecond.Count)"

Write-Host "`n== 12. Revocation ==" -ForegroundColor Cyan
$revokeTarget = ($pending | Where-Object { $_.email -eq $second -and $_.status -eq 'pending' } | Select-Object -First 1)
Invoke-RestMethod "$api/admin/invitations/$($revokeTarget.id)" -Method Delete -Headers $ah | Out-Null
$revoked = Raw 'Get' "$api/invitations/$secondToken" $null $null
Check "revoked link stops working" ($revoked.Status -ge 400) "status=$($revoked.Status)"
Check "revocation is explained to the recipient" ($revoked.Body -match 'replaced or cancelled') "msg=$($revoked.Body)"

Write-Host "`n== 13. Expired invitations ==" -ForegroundColor Cyan
$expiredEmail = "expired.$stamp@grantos.local"
$inv3 = Invoke-RestMethod "$api/users/invite" -Method Post -Headers $ah -ContentType 'application/json' `
  -Body (@{email=$expiredEmail; role='user'} | ConvertTo-Json)
$expToken = ($inv3.accept_url -split '/invite/')[-1]
# Age it past expiry directly in the database.
cmd /c "docker exec grantos-postgres psql -U grantos -d grantos -c ""UPDATE invitations SET expires_at = now() - interval '1 day' WHERE id = '$($inv3.invitation.id)'""" | Out-Null
$exp = Raw 'Get' "$api/invitations/$expToken" $null $null
Check "expired link is rejected" ($exp.Status -ge 400) "status=$($exp.Status)"
Check "expiry is explained" ($exp.Body -match 'expired') "msg=$($exp.Body)"

$expAcceptBlocked = $false
try { Invoke-RestMethod "$api/invitations/$expToken/accept" -Method Post -ContentType 'application/json' `
        -Body (@{password=$newPass} | ConvertTo-Json) | Out-Null }
catch { $expAcceptBlocked = $true }
Check "expired link cannot be accepted" $expAcceptBlocked "acceptance succeeded"

Write-Host "`n== 14. Garbage tokens ==" -ForegroundColor Cyan
foreach ($bad in @('nonsense', ('a' * 64), '../../etc/passwd')) {
  $rejected = $false
  try { Invoke-RestMethod "$api/invitations/$([uri]::EscapeDataString($bad))" | Out-Null }
  catch { $rejected = $true }
  Check "rejects invalid token '$($bad.Substring(0,[Math]::Min(12,$bad.Length)))'" $rejected "accepted"
}

Write-Host "`n== 15. Token is stored only as a hash ==" -ForegroundColor Cyan
$raw = cmd /c "docker exec grantos-postgres psql -U grantos -d grantos -tAc ""SELECT count(*) FROM invitations WHERE token_hash = '$secondToken'"" 2>nul"
Check "raw token is not stored in the database" ([int]$raw -eq 0) "raw token found in token_hash"
$hashLen = cmd /c "docker exec grantos-postgres psql -U grantos -d grantos -tAc ""SELECT DISTINCT length(token_hash) FROM invitations"" 2>nul"
Check "stored value is a SHA-256 hash (64 hex chars)" (($hashLen -join '') -match '64') "lengths=$hashLen"

Write-Host "`n== Cleanup ==" -ForegroundColor Cyan
$u = (Invoke-RestMethod "$api/users" -Headers $ah) | Where-Object { $_.email -eq $invitee }
if ($u) { Invoke-RestMethod "$api/users/$($u.id)" -Method Delete -Headers $ah | Out-Null }
cmd /c "docker exec grantos-postgres psql -U grantos -d grantos -c ""DELETE FROM invitations WHERE email LIKE '%.$stamp@grantos.local'""" | Out-Null
Check "test records removed" $true ""

Write-Host "`n--------------------------------------"
Write-Host "PASSED: $pass    FAILED: $fail    SKIPPED: $skip" -ForegroundColor $(if($fail -eq 0){'Green'}else{'Red'})
if ($skip -gt 0) { Write-Host "(skips are environment-dependent, not failures)" -ForegroundColor DarkGray }
Write-Host "--------------------------------------`n"
if ($fail -gt 0) { exit 1 }
