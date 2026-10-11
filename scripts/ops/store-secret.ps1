<#
.SYNOPSIS
  Human-run helper: moves a secret you just COPIED from a provider screen into its destination without ever printing it.

.DESCRIPTION
  Reads the clipboard, refuses empty values and values whose shape does not match the credential named by -Name, writes
  the value (never on a command line, never to the console) to one destination, and clears the clipboard.
  Destinations:
    github  repository secret (gh secret set, value sent on stdin without a trailing newline)
    dpapi   %USERPROFILE%\.cruzial\<name>.dpapi, encrypted with Windows DPAPI for the current user only
    vercel  Production-only environment variable of project cruzial-platform-v2: the entry whose targets are EXACTLY
            [production] is updated in place (never removed, other targets are never touched); refuses when ambiguous.
  Use -WhatIf to validate the clipboard value and see the plan without writing anything.

.EXAMPLES
  # Vercel monitor token (create it with scope: project cruzial-platform-v2, expiry 90 days), then:
  scripts\ops\store-secret.ps1 -To github -Name VERCEL_TOKEN
  # Supabase monitor token (scoped: Advisors Read + Logs Read, project iyxidhglyqkzoziyewlc):
  scripts\ops\store-secret.ps1 -To github -Name SUPABASE_ACCESS_TOKEN
  # New Production database password (kept only for operator scripts):
  scripts\ops\store-secret.ps1 -To dpapi -Name SUPABASE_DB_PASSWORD
  # New Supabase secret key / Cloudinary pair into the Production environment of Vercel:
  scripts\ops\store-secret.ps1 -To vercel -Name SUPABASE_SECRET_KEY
  scripts\ops\store-secret.ps1 -To vercel -Name CLOUDINARY_API_KEY      # copy the key, run, then the secret:
  scripts\ops\store-secret.ps1 -To vercel -Name CLOUDINARY_API_SECRET
  # Vercel changes need a new deployment afterwards:  npx vercel redeploy <current production deployment URL>
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][ValidateSet("github", "dpapi", "vercel")][string]$To,
  [Parameter(Mandatory = $true)][ValidateSet("VERCEL_TOKEN", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_SECRET_KEY", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "ROTATION_SELFTEST")][string]$Name,
  [string]$Repo = "Abel-Castill0/cruzialparfums"
)

$ErrorActionPreference = "Stop"
$Patterns = @{
  VERCEL_TOKEN          = '^vcp_[A-Za-z0-9_]{20,}$'
  SUPABASE_ACCESS_TOKEN = '^sbp_[A-Za-z0-9_]{20,}$'
  SUPABASE_DB_PASSWORD  = '^\S{16,}$'
  SUPABASE_SECRET_KEY   = '^sb_secret_[A-Za-z0-9_-]{20,}$'
  CLOUDINARY_API_KEY    = '^\d{15}$'
  CLOUDINARY_API_SECRET = '^[A-Za-z0-9_-]{20,40}$'
  ROTATION_SELFTEST     = '^selftest-[a-z0-9]{8,}$'
}
$ProjectId = "prj_u2ZX24IO9akHdN0qlzveQNwte59l"
$TeamId = "team_OPJLunXDFXq0o9kKQK6VOt8Z"

function Invoke-WithStdin([string]$Exe, [string[]]$ArgList, [string]$Text) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = ($ArgList | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join " "
  $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.Write($Text); $p.StandardInput.Close()
  $out = $p.StandardOutput.ReadToEnd(); $err = $p.StandardError.ReadToEnd(); $p.WaitForExit()
  [pscustomobject]@{ Code = $p.ExitCode; Out = $out; Err = $err }
}

try {
  $raw = Get-Clipboard -Raw
  $value = if ($null -ne $raw) { $raw.Trim() } else { "" }
  if ([string]::IsNullOrEmpty($value)) { throw "The clipboard is empty. Copy the value from the provider screen first. Nothing was written." }
  if ($value -notmatch $Patterns[$Name]) { throw "The clipboard does not look like $Name (wrong shape; length $($value.Length)). Nothing was written." }
  Write-Host "Clipboard accepted for $Name (length $($value.Length), value not shown)."

  switch ($To) {
    "github" {
      if ($PSCmdlet.ShouldProcess("GitHub secret $Name in $Repo", "set")) {
        $gh = (Get-Command gh -ErrorAction Stop).Source
        $r = Invoke-WithStdin $gh @("secret", "set", $Name, "--repo", $Repo) $value
        if ($r.Code -ne 0) { throw "gh secret set failed (exit $($r.Code)): $($r.Err.Split("`n")[0])" }
        Write-Host "GitHub secret $Name updated."
      }
    }
    "dpapi" {
      $dir = Join-Path $env:USERPROFILE ".cruzial"
      $file = Join-Path $dir (($Name.ToLower() -replace "_", "-") + ".dpapi")
      if ($PSCmdlet.ShouldProcess($file, "write DPAPI-protected value")) {
        New-Item -ItemType Directory -Force $dir | Out-Null
        ConvertTo-SecureString -String $value -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $file -Encoding ascii
        icacls $file /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(F)" | Out-Null
        Write-Host "Stored $file (readable only by this Windows user; read it back with Get-CruzialSecret in scripts\ops\secret-env.ps1)."
      }
    }
    "vercel" {
      $vercel = (Get-Command vercel.cmd -ErrorAction SilentlyContinue).Source
      if (-not $vercel) { throw "Vercel CLI (vercel.cmd) not found on PATH. Install it once with: npm i -g vercel, then run vercel login." }
      $prevEap = $ErrorActionPreference; $ErrorActionPreference = "Continue"   # the CLI prints hints on stderr
      $json = & $vercel api "/v10/projects/$ProjectId/env?teamId=$TeamId" 2>$null | Out-String
      $ErrorActionPreference = $prevEap
      $envs = (ConvertFrom-Json $json).envs | Where-Object { $_.key -eq $Name }
      $prod = @($envs | Where-Object { ($_.target -join ",") -eq "production" })
      Write-Host ("Vercel entries named {0}: {1} total; Production-only entries: {2}" -f $Name, @($envs).Count, $prod.Count)
      if ($prod.Count -ne 1) { throw "Expected exactly one Production-only entry for $Name; refusing to guess. Edit it in the Vercel dashboard instead." }
      if ($PSCmdlet.ShouldProcess("Vercel Production env $Name (entry $($prod[0].id.Substring(0,6))...)", "update value")) {
        $body = (@{ value = $value } | ConvertTo-Json -Compress)
        $r = Invoke-WithStdin $vercel @("api", "/v9/projects/$ProjectId/env/$($prod[0].id)?teamId=$TeamId", "-X", "PATCH", "--input", "-") $body
        if ($r.Code -ne 0) { throw "Vercel update failed (exit $($r.Code)): $(($r.Err -split "`n")[0])" }
        Write-Host "Vercel Production $Name updated. A new deployment is required: npx vercel redeploy <current production deployment URL>"
      }
    }
  }
}
finally {
  try { Set-Clipboard -Value " " -WhatIf:$false } catch { }
}



