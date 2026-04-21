[CmdletBinding()]
param(
  [string]$BackendBaseUrl = "http://127.0.0.1:8000",
  [string]$SchedulerBaseUrl = "http://127.0.0.1:8200",
  [string]$AgentBaseUrl = "http://127.0.0.1:8100",
  [string]$ProjectId = "",
  [switch]$SkipScheduler,
  [switch]$WaitCallback,
  [int]$CallbackTimeoutSec = 15
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
  Write-Host ("`n==> " + $msg)
}

function Invoke-Json([string]$method, [string]$url, $body = $null, $headers = $null) {
  $params = @{
    Method = $method
    Uri = $url
    ContentType = "application/json"
  }
  if ($headers) { $params["Headers"] = $headers }
  if ($null -ne $body) { $params["Body"] = ($body | ConvertTo-Json -Depth 20) }
  return Invoke-RestMethod @params
}

function Wait-TaskGroupStatus([string]$projectId, [string]$requirementId, [string]$taskGroupId, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $timeoutSec))
  $last = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $tgs = Invoke-Json "GET" "$BackendBaseUrl/api/projects/$projectId/requirements/$requirementId/task-groups"
      foreach ($tg in @($tgs)) {
        if ($tg.id -eq $taskGroupId) {
          $last = $tg.status
          if ($last -eq "completed" -or $last -eq "failed" -or $last -eq "invalidated") {
            return $last
          }
        }
      }
    } catch {
      # ignore transient errors while services warming up
    }
    Start-Sleep -Milliseconds 500
  }
  return $last
}

Write-Step "M6 smoke: resolve project"
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  try {
    $projects = Invoke-Json "GET" "$BackendBaseUrl/api/projects"
  } catch {
    throw ("Backend not reachable: $BackendBaseUrl. Start backend-service and retry. " +
      "Example: cd data-foundry-backend-service; mvn --% -Dmaven.repo.local=E:\\huatai\\datafoundry_java\\tmp\\.m2 spring-boot:run")
  }
  $projectsArr = @($projects)
  if ($null -eq $projectsArr -or $projectsArr.Length -eq 0) {
    throw ("No projects found. Create projects in DB, or enable admin endpoints and seed demo data. " +
      "Start backend with `--datafoundry.admin.enabled=true`, then call POST /api/admin/seed.")
  }
  $ProjectId = $projectsArr[0].id
}
Write-Host ("project_id=" + $ProjectId)

Write-Step "Create requirement via legacy route"
$reqTitle = "smoke-m6-" + (Get-Date -Format "yyyyMMddHHmmss")
$createLegacy = @{
  title = $reqTitle
  phase = "production"
  wide_table = @{
    title = "primary"
    indicator_groups = @()
    schedule_rules = @()
  }
}
$req = Invoke-Json "POST" "$BackendBaseUrl/api/projects/$ProjectId/requirements" $createLegacy
$requirementId = $req.id
$wideTableId = $req.wide_table.id
Write-Host ("requirement_id=" + $requirementId)
Write-Host ("wide_table_id=" + $wideTableId)

Write-Step "Compare legacy list vs canonical list shapes"
$legacyList = Invoke-Json "GET" "$BackendBaseUrl/api/projects/$ProjectId/requirements"
$canonList = Invoke-Json "GET" "$BackendBaseUrl/api/requirements?project_id=$ProjectId"
$legacyArr = @($legacyList)
$canonArr = @($canonList)
if ($legacyArr.Length -lt 1 -or $canonArr.Length -lt 1) { throw "Requirement list empty unexpectedly" }
if ($null -eq $legacyArr[0].wide_table) { throw "legacy list item missing wide_table" }
if ($null -eq $canonArr[0].wide_table) { throw "canonical list item missing wide_table" }

Write-Step "Get detail via canonical route"
$detailUrl = "$BackendBaseUrl/api/requirements/${requirementId}?project_id=$ProjectId"
Write-Host ("GET " + $detailUrl)
$canonDetail = Invoke-Json "GET" $detailUrl
if ($canonDetail.id -ne $requirementId) { throw "canonical detail id mismatch" }

Write-Step "Persist a minimal plan (creates one task_group)"
$taskGroupId = "TG-SMOKE-" + (Get-Date -Format "yyyyMMddHHmmss")
$planBody = @{
  task_groups = @(
    @{
      id = $taskGroupId
      business_date = "2026-01-01"
      status = "pending"
      plan_version = 1
      source_type = "manual"
      triggered_by = "smoke"
    }
  )
}
$planResp = Invoke-Json "POST" "$BackendBaseUrl/api/requirements/$requirementId/wide-tables/$wideTableId/plan" $planBody
if ($planResp.ok -ne $true) { throw "plan persist failed" }

Write-Step "Ensure fetch tasks and execute task_group via legacy execution routes"
$ensure = Invoke-Json "POST" "$BackendBaseUrl/api/task-groups/$taskGroupId/ensure-tasks"
if ($ensure.ok -ne $true) { throw "ensure-tasks failed" }
$exec = Invoke-Json "POST" "$BackendBaseUrl/api/task-groups/$taskGroupId/execute" @{}
if ($exec.ok -ne $true) { throw "execute task_group failed" }

if ($WaitCallback) {
  Write-Step "Wait for scheduler callback to complete task_group (best-effort)"
  $final = Wait-TaskGroupStatus $ProjectId $requirementId $taskGroupId $CallbackTimeoutSec
  if ([string]::IsNullOrWhiteSpace($final)) {
    throw ("callback wait timeout: task_group not found or status unknown. " +
      "Check backend/scheduler logs; ensure backend runs with integration profile and scheduler/agent are up.")
  }
  if ($final -ne "completed" -and $final -ne "failed" -and $final -ne "invalidated") {
    throw ("callback wait timeout: status=" + $final)
  }
  Write-Host ("task_group_status=" + $final)
}

Write-Step "List task-groups/tasks via canonical task facade"
$tgs = Invoke-Json "GET" "$BackendBaseUrl/api/tasks/task-groups?project_id=$ProjectId&requirement_id=$requirementId"
$tasks = Invoke-Json "GET" "$BackendBaseUrl/api/tasks?project_id=$ProjectId&requirement_id=$requirementId"
$tgsArr = @($tgs)
$tasksArr = @($tasks)
Write-Host ("task_groups=" + $tgsArr.Length + ", tasks=" + $tasksArr.Length)

if (-not $SkipScheduler) {
  Write-Step "Schedule jobs list/create (best-effort)"
  try {
    $jobs = Invoke-Json "GET" "$BackendBaseUrl/api/schedule-jobs"
    $jobsArr = @($jobs)
    Write-Host ("schedule_jobs=" + $jobsArr.Length)
  } catch {
    Write-Host ("WARN: scheduler facade list failed: " + $_.Exception.Message)
  }

  try {
    $headers = @{ "X-Idempotency-Key" = ("smoke-m6:" + $taskGroupId) }
    $createJob = @{
      task_group_id = $taskGroupId
      trigger_type = "manual"
      operator = "smoke"
    }
    $job = Invoke-Json "POST" "$BackendBaseUrl/api/schedule-jobs" $createJob $headers
    Write-Host ("created_schedule_job_id=" + $job.id + ", status=" + $job.status)
  } catch {
    Write-Host ("WARN: scheduler facade create failed: " + $_.Exception.Message)
  }
}

Write-Host "`nM6 smoke finished OK."
