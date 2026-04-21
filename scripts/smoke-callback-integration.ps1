[CmdletBinding()]
param(
  [string]$MavenRepoLocal = "E:\huatai\datafoundry_java\tmp\.m2",
  [int]$StartupTimeoutSec = 60,
  [int]$CallbackTimeoutSec = 20,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
  Write-Host ("`n==> " + $msg)
}

function Resolve-Jar([string]$moduleDir) {
  $target = Join-Path $moduleDir "target"
  if (-not (Test-Path $target)) { return $null }
  $jar = Get-ChildItem $target -Filter "*-SNAPSHOT.jar" | Select-Object -First 1
  if ($null -eq $jar) { return $null }
  return $jar.FullName
}

function Wait-HttpOk([string]$url, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $timeoutSec))
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Method GET -Uri $url -TimeoutSec 3
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return $true }
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-JavaService([string]$name, [string]$jarPath, [hashtable]$env = $null) {
  if ([string]::IsNullOrWhiteSpace($jarPath) -or -not (Test-Path $jarPath)) {
    throw ("Jar not found for " + $name + ": " + $jarPath)
  }
  New-Item -ItemType Directory -Force -Path "logs" | Out-Null
  $out = Join-Path "logs" ($name + ".run.log")
  $err = Join-Path "logs" ($name + ".run.err.log")

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "java"
  $psi.Arguments = "-jar `"$jarPath`""
  $psi.WorkingDirectory = (Get-Location).Path
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  if ($env) {
    foreach ($k in $env.Keys) {
      $psi.EnvironmentVariables[$k] = [string]$env[$k]
    }
  }

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()

  # async log pump
  $stdOut = New-Object System.IO.StreamWriter($out, $false, [System.Text.Encoding]::UTF8)
  $stdErr = New-Object System.IO.StreamWriter($err, $false, [System.Text.Encoding]::UTF8)
  $p.BeginOutputReadLine()
  $p.BeginErrorReadLine()
  $p.add_OutputDataReceived({ param($sender,$e) if ($e.Data) { $stdOut.WriteLine($e.Data); $stdOut.Flush() } })
  $p.add_ErrorDataReceived({ param($sender,$e) if ($e.Data) { $stdErr.WriteLine($e.Data); $stdErr.Flush() } })

  Write-Host ("started " + $name + " pid=" + $p.Id)
  return $p
}

function Stop-ServiceProcess($p, [string]$name) {
  if ($null -eq $p) { return }
  try {
    if (-not $p.HasExited) {
      Write-Host ("stopping " + $name + " pid=" + $p.Id)
      $p.Kill()
      $p.WaitForExit(5000) | Out-Null
    }
  } catch {
    Write-Host ("WARN: failed to stop " + $name + ": " + $_.Exception.Message)
  }
}

Write-Step "Prepare (optional build)"
if (-not $SkipBuild) {
  Write-Step "Build jars (skipTests)"
  mvn "-Dmaven.repo.local=$MavenRepoLocal" -DskipTests package | Out-Null
}

$agentJar = Resolve-Jar "data-foundry-agent-service"
$schedulerJar = Resolve-Jar "data-foundry-scheduler-service"
$backendJar = Resolve-Jar "data-foundry-backend-service"

$agent = $null
$scheduler = $null
$backend = $null

try {
  Write-Step "Start agent-service"
  $agent = Start-JavaService "agent" $agentJar @{}
  if (-not (Wait-HttpOk "http://127.0.0.1:8100/actuator/health" $StartupTimeoutSec)) {
    throw "agent-service not ready"
  }

  Write-Step "Start scheduler-service"
  $scheduler = Start-JavaService "scheduler" $schedulerJar @{}
  if (-not (Wait-HttpOk "http://127.0.0.1:8200/actuator/health" $StartupTimeoutSec)) {
    throw "scheduler-service not ready"
  }

  Write-Step "Start backend-service (integration profile: placeholder-complete=false)"
  $backend = Start-JavaService "backend" $backendJar @{ "SPRING_PROFILES_ACTIVE" = "integration" }
  if (-not (Wait-HttpOk "http://127.0.0.1:8000/actuator/health" $StartupTimeoutSec)) {
    throw "backend-service not ready"
  }

  Write-Step "Run smoke with callback wait"
  powershell -ExecutionPolicy Bypass -File scripts\smoke-m6.ps1 -WaitCallback -CallbackTimeoutSec $CallbackTimeoutSec

  Write-Host "`nIntegration callback smoke finished OK."
} finally {
  Stop-ServiceProcess $backend "backend"
  Stop-ServiceProcess $scheduler "scheduler"
  Stop-ServiceProcess $agent "agent"
}

