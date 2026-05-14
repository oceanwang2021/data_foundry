param(
  [switch]$StopExistingPorts,
  [switch]$Visible,
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$SkipScheduler,
  [switch]$SkipAgent
)

$ErrorActionPreference = "Stop"

$processEnvironment = [Environment]::GetEnvironmentVariables("Process")
if ($processEnvironment.Contains("Path") -and $processEnvironment.Contains("PATH")) {
  $effectivePath = [string]$processEnvironment["Path"]
  if (-not $effectivePath) {
    $effectivePath = [string]$processEnvironment["PATH"]
  }
  [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
  [Environment]::SetEnvironmentVariable("Path", $effectivePath, "Process")
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $Root "logs"
$FrontendDir = Join-Path $Root "data-foundry-frontend"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Resolve-CommandPath {
  param(
    [string]$Name,
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "Cannot find command: $Name. Please install it or add it to PATH."
}

function Stop-Listeners {
  param([int[]]$Ports)

  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $Ports -contains $_.LocalPort }

  $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force
      Write-Host "Stopped existing listener process $processId"
    }
  }
}

function Start-ServiceProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command,
    [string]$Url
  )

  $outLog = Join-Path $LogsDir "$Name-$Timestamp.out.log"
  $errLog = Join-Path $LogsDir "$Name-$Timestamp.err.log"
  $runner = Join-Path $LogsDir "$Name-$Timestamp.run.ps1"
  $windowStyle = if ($Visible) { "Normal" } else { "Hidden" }

  $wrappedCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location '$WorkingDirectory'
$Command
"@
  Set-Content -Path $runner -Value $wrappedCommand -Encoding UTF8

  $process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $runner) `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle $windowStyle `
    -PassThru

  [pscustomobject]@{
    Name = $Name
    Pid = $process.Id
    Url = $Url
    OutLog = $outLog
    ErrLog = $errLog
    Runner = $runner
  }
}

$mavenCandidates = @()
if ($env:USERPROFILE) {
  $mavenCandidates += Join-Path $env:USERPROFILE ".trae-cn\tools\maven\latest\bin\mvn.cmd"
}
if ($env:MAVEN_HOME) {
  $mavenCandidates += Join-Path $env:MAVEN_HOME "bin\mvn.cmd"
}
$mavenPath = Resolve-CommandPath "mvn.cmd" $mavenCandidates

$npmCandidates = @(
  "C:\Program Files\nodejs\npm.cmd",
  "D:\app\nodejs\npm.cmd"
)
$npmPath = Resolve-CommandPath "npm.cmd" $npmCandidates

$javaHomeCandidate = Join-Path $env:USERPROFILE ".jdks\temurin-8\jre"
$javaHomeLine = if (Test-Path $javaHomeCandidate) {
  "`$env:JAVA_HOME = '$javaHomeCandidate'"
} else {
  ""
}

$mavenExtraArgs = @()
$mavenLocalRepoCandidate = Join-Path $env:USERPROFILE ".m2\repository"
if (Test-Path $mavenLocalRepoCandidate) {
  $mavenExtraArgs += "-Dmaven.repo.local=$mavenLocalRepoCandidate"
}
if ($env:DATAFOUNDRY_MAVEN_OFFLINE -eq "1") {
  $mavenExtraArgs = @("-o") + $mavenExtraArgs
}
$mavenExtraLine = ($mavenExtraArgs | ForEach-Object { "'$_'" }) -join " "

if ($StopExistingPorts) {
  Stop-Listeners -Ports @(3000, 8000, 8100, 8200)
}

$services = @()

if (-not $SkipBackend) {
  $services += Start-ServiceProcess `
    -Name "backend" `
    -WorkingDirectory $Root `
    -Url "http://localhost:8000" `
    -Command @"
$javaHomeLine
& '$mavenPath' $mavenExtraLine -pl data-foundry-backend-service -am -DskipTests spring-boot:run
"@
}

if (-not $SkipAgent) {
  $services += Start-ServiceProcess `
    -Name "agent" `
    -WorkingDirectory $Root `
    -Url "http://localhost:8100" `
    -Command @"
$javaHomeLine
& '$mavenPath' $mavenExtraLine -pl data-foundry-agent-service -am -DskipTests spring-boot:run
"@
}

if (-not $SkipScheduler) {
  $services += Start-ServiceProcess `
    -Name "scheduler" `
    -WorkingDirectory $Root `
    -Url "http://localhost:8200" `
    -Command @"
$javaHomeLine
& '$mavenPath' $mavenExtraLine -pl data-foundry-scheduler-service -am -DskipTests spring-boot:run
"@
}

if (-not $SkipFrontend) {
  $services += Start-ServiceProcess `
    -Name "frontend" `
    -WorkingDirectory $FrontendDir `
    -Url "http://127.0.0.1:3000" `
    -Command @"
`$env:NODE_OPTIONS = '--max-old-space-size=4096'
& '$npmPath' run dev
"@
}

Write-Host ""
Write-Host "Data Foundry services are starting."
Write-Host "Logs: $LogsDir"
Write-Host ""

$services | Format-Table Name, Pid, Url, OutLog, ErrLog -AutoSize

Write-Host ""
Write-Host "Tips:"
Write-Host "  View a log: Get-Content -Wait logs\<service>-$Timestamp.out.log"
Write-Host "  Stop by PID: Stop-Process -Id <pid>"
Write-Host "  Restart and free ports first: .\start-all.ps1 -StopExistingPorts"
