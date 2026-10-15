$ErrorActionPreference = 'Stop'
$backend = 'C:\Users\sruz\Project\venu\GrantOS\GrantOSBase44\backend'
$pass = 0; $fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  FAIL  $name  -> $detail" -ForegroundColor Red; $script:fail++ }
}

# A throwaway database on the same server. The primary `grantos` database is
# never touched by this script.
$testDb  = 'grantos_cleanstart'
$testUrl = "postgresql://grantos:grantos_local_dev@localhost:55432/$testDb`?schema=public"

Write-Host "`n== Create an isolated empty database ==" -ForegroundColor Cyan
cmd /c "docker exec grantos-postgres psql -U grantos -d postgres -c `"DROP DATABASE IF EXISTS $testDb`" >nul 2>&1"
cmd /c "docker exec grantos-postgres psql -U grantos -d postgres -c `"CREATE DATABASE $testDb`" >nul 2>&1"
$exists = cmd /c "docker exec grantos-postgres psql -U grantos -d postgres -tAc `"SELECT 1 FROM pg_database WHERE datname='$testDb'`" 2>nul"
Check "empty database created" ($exists -match '1') "not created"

Write-Host "`n== Run migrations from scratch ==" -ForegroundColor Cyan
Push-Location $backend
$env:DATABASE_URL = $testUrl
$migrateOut = cmd /c "npx prisma migrate deploy 2>&1"
Check "migrate deploy succeeded on an empty database" ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE"
Check "migration was actually applied" (($migrateOut -join "`n") -match 'successfully applied|already in sync') "out=$($migrateOut -join ' ')"

$tables = cmd /c "docker exec grantos-postgres psql -U grantos -d $testDb -tAc `"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`" 2>nul"
Check "tables created (>=25)" ([int]$tables -ge 25) "tables=$tables"

Write-Host "`n== Seed the clean database ==" -ForegroundColor Cyan
$seedOut = cmd /c "npx ts-node prisma/seed.ts 2>&1"
Check "seed completed on a clean database" ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE out=$($seedOut | Select-Object -Last 3)"

$grants = cmd /c "docker exec grantos-postgres psql -U grantos -d $testDb -tAc `"SELECT count(*) FROM grants`" 2>nul"
$users  = cmd /c "docker exec grantos-postgres psql -U grantos -d $testDb -tAc `"SELECT count(*) FROM users`" 2>nul"
$rules  = cmd /c "docker exec grantos-postgres psql -U grantos -d $testDb -tAc `"SELECT count(*) FROM notification_rules`" 2>nul"
Check "demo grants seeded" ([int]$grants -eq 3) "grants=$grants"
Check "demo users seeded" ([int]$users -eq 2) "users=$users"
Check "notification rules seeded" ([int]$rules -eq 6) "rules=$rules"

Write-Host "`n== Seed is safe to re-run ==" -ForegroundColor Cyan
cmd /c "npx ts-node prisma/seed.ts >nul 2>&1" | Out-Null
$grants2 = cmd /c "docker exec grantos-postgres psql -U grantos -d $testDb -tAc `"SELECT count(*) FROM grants`" 2>nul"
$rules2  = cmd /c "docker exec grantos-postgres psql -U grantos -d $testDb -tAc `"SELECT count(*) FROM notification_rules`" 2>nul"
Check "re-seed did not duplicate grants" ([int]$grants2 -eq [int]$grants) "before=$grants after=$grants2"
Check "re-seed did not duplicate rules" ([int]$rules2 -eq [int]$rules) "before=$rules after=$rules2"

Write-Host "`n== Boot the API against the clean database ==" -ForegroundColor Cyan
# PowerShell 5.1 has no -Environment on Start-Process; the child inherits the
# parent's environment, so set the overrides here first.
$env:DATABASE_URL = $testUrl
$env:PORT = '3999'
$proc = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $backend `
  -RedirectStandardOutput "$env:TEMP\clean-api.log" -RedirectStandardError "$env:TEMP\clean-api.err.log" `
  -WindowStyle Hidden -PassThru

$up = $false
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-RestMethod 'http://127.0.0.1:3999/api/health' -TimeoutSec 2 | Out-Null; $up = $true; break }
  catch { Start-Sleep -Seconds 1 }
}
Check "API started against the clean database" $up "did not start"

if ($up) {
  $tok = (Invoke-RestMethod 'http://127.0.0.1:3999/api/auth/login' -Method Post -ContentType 'application/json' `
    -Body (@{email='admin@grantos.local';password='DemoAdmin!2026'} | ConvertTo-Json)).access_token
  Check "seeded admin can sign in on a fresh install" ([bool]$tok) "login failed"
  $g = Invoke-RestMethod 'http://127.0.0.1:3999/api/entities/Grant' -Headers @{ Authorization = "Bearer $tok" }
  Check "seeded data readable through the API" ($g.Count -eq 3) "count=$($g.Count)"
}
if ($proc -and -not $proc.HasExited) { $proc.Kill() }

Write-Host "`n== Drop the throwaway database ==" -ForegroundColor Cyan
Start-Sleep -Seconds 2
cmd /c "docker exec grantos-postgres psql -U grantos -d postgres -c `"DROP DATABASE IF EXISTS $testDb WITH (FORCE)`" >nul 2>&1"
$gone = cmd /c "docker exec grantos-postgres psql -U grantos -d postgres -tAc `"SELECT count(*) FROM pg_database WHERE datname='$testDb'`" 2>nul"
Check "throwaway database dropped" ([int]$gone -eq 0) "still present"

# Confirm the real database is untouched.
$mainGrants = cmd /c "docker exec grantos-postgres psql -U grantos -d grantos -tAc `"SELECT count(*) FROM grants`" 2>nul"
Check "primary database untouched" ([int]$mainGrants -gt 0) "grants=$mainGrants"
Write-Host "  (primary database still holds $mainGrants grants)"

Pop-Location
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\PORT -ErrorAction SilentlyContinue

Write-Host "`n--------------------------------------"
Write-Host "PASSED: $pass    FAILED: $fail" -ForegroundColor $(if($fail -eq 0){'Green'}else{'Red'})
Write-Host "--------------------------------------`n"
if ($fail -gt 0) { exit 1 }
