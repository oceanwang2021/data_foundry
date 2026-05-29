package com.huatai.datafoundry.backend.task.interfaces.web;

import com.huatai.datafoundry.backend.task.application.service.ScheduleJobFacadeAppService;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJob;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJobCreateCommand;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ScheduleJobFacadeController {
  private final ScheduleJobFacadeAppService scheduleJobFacadeAppService;

  public ScheduleJobFacadeController(
      ScheduleJobFacadeAppService scheduleJobFacadeAppService) {
    this.scheduleJobFacadeAppService = scheduleJobFacadeAppService;
  }

  @GetMapping("/api/schedule-jobs")
  public List<ScheduleJob> listScheduleJobs(
      @RequestParam(value = "trigger_type", required = false) String triggerType,
      @RequestParam(value = "status", required = false) String status,
      @RequestParam(value = "task_group_id", required = false) String taskGroupId,
      @RequestParam(value = "task_group_ids", required = false) String taskGroupIds) {
    try {
      List<ScheduleJob> jobs = scheduleJobFacadeAppService.list(triggerType, status);
      Set<String> requestedTaskGroupIds = buildTaskGroupFilter(taskGroupId, taskGroupIds);
      if (requestedTaskGroupIds.isEmpty()) {
        return jobs;
      }
      return jobs.stream()
          .filter(job -> job != null && requestedTaskGroupIds.contains(job.getTaskGroupId()))
          .collect(Collectors.toList());
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable");
    }
  }

  @PostMapping("/api/schedule-jobs")
  public ScheduleJob createScheduleJob(
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody CreateScheduleJobRequest body) {
    if (body == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid schedule job request");
    }
    ScheduleJobCreateCommand command = new ScheduleJobCreateCommand();
    command.setTaskGroupId(body.getTaskGroupId());
    command.setTaskId(body.getTaskId());
    command.setTriggerType(body.getTriggerType());
    command.setOperator(body.getOperator());
    command.setBackfillRequestId(body.getBackfillRequestId());
    try {
      if (idempotencyKey != null && idempotencyKey.trim().length() > 0) {
        return scheduleJobFacadeAppService.createWithIdempotency(command, idempotencyKey.trim());
      }
      return scheduleJobFacadeAppService.create(command);
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable");
    }
  }

  public static class CreateScheduleJobRequest {
    private String taskGroupId;
    private String taskId;
    private String triggerType;
    private String operator;
    private String backfillRequestId;

    public String getTaskGroupId() {
      return taskGroupId;
    }

    public void setTaskGroupId(String taskGroupId) {
      this.taskGroupId = taskGroupId;
    }

    public String getTaskId() {
      return taskId;
    }

    public void setTaskId(String taskId) {
      this.taskId = taskId;
    }

    public String getTriggerType() {
      return triggerType;
    }

    public void setTriggerType(String triggerType) {
      this.triggerType = triggerType;
    }

    public String getOperator() {
      return operator;
    }

    public void setOperator(String operator) {
      this.operator = operator;
    }

    public String getBackfillRequestId() {
      return backfillRequestId;
    }

    public void setBackfillRequestId(String backfillRequestId) {
      this.backfillRequestId = backfillRequestId;
    }
  }

  private Set<String> buildTaskGroupFilter(String taskGroupId, String taskGroupIds) {
    LinkedHashSet<String> out = new LinkedHashSet<String>();
    if (taskGroupId != null && taskGroupId.trim().length() > 0) {
      out.add(taskGroupId.trim());
    }
    if (taskGroupIds != null && taskGroupIds.trim().length() > 0) {
      out.addAll(Arrays.stream(taskGroupIds.split(","))
          .map(String::trim)
          .filter(value -> value.length() > 0)
          .collect(Collectors.toList()));
    }
    return out;
  }
}
