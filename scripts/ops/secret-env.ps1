<#
  Dot-source in the PowerShell session that runs operator scripts:   . scripts\ops\secret-env.ps1
  Get-CruzialSecret supabase-db-password   -> returns the plaintext (only inside this process) from %USERPROFILE%\.cruzial\*.dpapi
  Invoke-CruzialDbPushDryRun               -> `supabase db push --dry-run` against PRODUCTION (read-only; asserts the link first)
  Invoke-CruzialBackup                     -> Production backup via scripts\backup-production-db.mjs
  The value is never written to a file in the repository, never put on a command line and never printed.
#>
$script:ProdRef = "iyxidhglyqkzoziyewlc"

function Get-CruzialSecret([Parameter(Mandatory = $true)][string]$Name) {
  $file = Join-Path (Join-Path $env:USERPROFILE ".cruzial") ($Name + ".dpapi")
  if (-not (Test-Path $file)) { throw "No stored secret '$Name' ($file). Store it with scripts\ops\store-secret.ps1 -To dpapi." }
  $secure = Get-Content $file | ConvertTo-SecureString
  [System.Net.NetworkCredential]::new("", $secure).Password
}

# Runs `supabase db push --dry-run` against PRODUCTION (read-only). Refuses unless the repo link points at the Production ref.
function Invoke-CruzialDbPushDryRun {
  $root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
  $ref = (Get-Content (Join-Path $root "supabase\.temp\project-ref") -ErrorAction Stop).Trim()
  if ($ref -ne $script:ProdRef) { throw "The repo is linked to $ref, not the Production project. Refusing." }
  $env:SUPABASE_DB_PASSWORD = Get-CruzialSecret "supabase-db-password"
  try {
    Push-Location $root
    npx --no-install supabase db push --linked --dry-run 2>&1 | ForEach-Object { "$_" }
  }
  finally { Pop-Location; $env:SUPABASE_DB_PASSWORD = $null }
}

# Takes a Production backup with the stored password (scripts\backup-production-db.mjs reads SUPABASE_DB_PASSWORD from the environment).
function Invoke-CruzialBackup {
  param([string]$OutputDir = "C:\cruzial-private-backups")
  $root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
  $env:SUPABASE_DB_PASSWORD = Get-CruzialSecret "supabase-db-password"
  try {
    Push-Location $root
    node scripts\backup-production-db.mjs --output-dir $OutputDir
  }
  finally { Pop-Location; $env:SUPABASE_DB_PASSWORD = $null }
}
