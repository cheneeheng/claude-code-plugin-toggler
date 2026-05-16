$ErrorActionPreference = 'Stop'
$Port = 17779
$ProjectDir = Join-Path $env:TEMP "smoke-$(Get-Random)"
$PluginsDir = Join-Path $env:USERPROFILE ".claude\plugins"
$ServerProcess = $null

function Cleanup {
  if ($null -ne $ServerProcess -and -not $ServerProcess.HasExited) {
    $ServerProcess.Kill()
    $ServerProcess.WaitForExit(3000) | Out-Null
  }
  Remove-Item -Recurse -Force $ProjectDir -ErrorAction SilentlyContinue
  Remove-Item -Force "$PluginsDir\installed_plugins.json" -ErrorAction SilentlyContinue
}

try {
  # ── Set up fixture files ──────────────────────────────────────────

  New-Item -ItemType Directory -Force -Path $PluginsDir | Out-Null
  New-Item -ItemType Directory -Force -Path "$ProjectDir\.claude" | Out-Null

  # Replace __PROJECT_ROOT__ with the actual temp dir.
  # Backslashes in the path must be doubled to produce valid JSON.
  $fixture = Get-Content tests\fixtures\installed_plugins.json -Raw
  $escapedPath = $ProjectDir.Replace('\', '\\')
  $fixture = $fixture.Replace('__PROJECT_ROOT__', $escapedPath)
  $fixture | Set-Content "$PluginsDir\installed_plugins.json" -Encoding UTF8

  Copy-Item tests\fixtures\settings.local.json "$ProjectDir\.claude\settings.local.json"

  # ── Start server ──────────────────────────────────────────────────
  # On Windows CI runners (actions/setup-python), the executable is 'python',
  # not 'python3'. Use 'python' here; the setup-python action adds it to PATH.

  $ServerProcess = Start-Process python `
    -ArgumentList "html\server.py", $Port, "`"$ProjectDir`"" `
    -PassThru -WindowStyle Hidden -WorkingDirectory (Get-Location)

  # Poll until ready (max 10s)
  $ready = $false
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep 1
    try {
      $null = Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -ErrorAction Stop
      $ready = $true
      break
    } catch { }
  }
  if (-not $ready) { throw "Server did not start within 10 seconds" }

  # ── Assertions ────────────────────────────────────────────────────

  $resp = Invoke-WebRequest "http://localhost:$Port/api/plugins" -UseBasicParsing
  $data = $resp.Content | ConvertFrom-Json

  # 1. Required top-level keys
  if ($null -eq $data.local)        { throw "Missing key: local" }
  if ($null -eq $data.global)       { throw "Missing key: global" }
  if ($null -eq $data.project_root) { throw "Missing key: project_root" }

  # 2. Plugin counts
  if ($data.local.Count  -ne 1) { throw "Expected 1 local plugin, got $($data.local.Count)" }
  if ($data.global.Count -ne 1) { throw "Expected 1 global plugin, got $($data.global.Count)" }

  # 3. Local plugin fields
  $lp = $data.local[0]
  if ($lp.id          -ne 'smoke-local@smoke-market') { throw "Wrong local id: $($lp.id)" }
  if ($lp.pluginScope -ne 'local')                    { throw "Wrong pluginScope: $($lp.pluginScope)" }
  if ($lp.enabled     -ne $true)                      { throw "Expected enabled=true" }

  # 4. Global plugin has pluginScope and no 'enabled' key
  $gp = $data.global[0]
  if ($gp.pluginScope -ne 'global') { throw "Wrong pluginScope: $($gp.pluginScope)" }
  if ($gp.PSObject.Properties['enabled']) { throw "Global plugin must not have enabled key" }

  # 5. POST /api/toggle round-trip
  $body = '{"id":"smoke-local@smoke-market","enabled":false}'
  $tr   = Invoke-WebRequest "http://localhost:$Port/api/toggle" `
            -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
  $td   = $tr.Content | ConvertFrom-Json
  if ($td.ok -ne $true) { throw "Toggle response not ok: $($tr.Content)" }

  # 6. Verify toggle persisted
  $resp2 = Invoke-WebRequest "http://localhost:$Port/api/plugins" -UseBasicParsing
  $data2 = $resp2.Content | ConvertFrom-Json
  if ($data2.local[0].enabled -ne $false) { throw "Toggle was not persisted" }

  Write-Host "OK: all smoke tests passed"

} finally {
  Cleanup
}
