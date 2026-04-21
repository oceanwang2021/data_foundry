package com.huatai.datafoundry.scheduler.schedule.interfaces.web;

import com.huatai.datafoundry.contract.scheduler.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.application.dto.CreateScheduleJobCommand;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleJobReadDto;
import com.huatai.datafoundry.scheduler.schedule.application.service.ScheduleJobAppService;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ScheduleJobController {
  private final ScheduleJobAppService scheduleJobAppService;

  public ScheduleJobController(ScheduleJobAppService scheduleJobAppService) {
    this.scheduleJobAppService = scheduleJobAppService;
  }

  @GetMapping("/api/schedule-jobs")
  public List<ScheduleJob> list(
      @RequestParam(value = "trigger_type", required = false) String triggerType,
      @RequestParam(value = "status", required = false) String status) {
    List<ScheduleJobReadDto> records = scheduleJobAppService.list(triggerType, status);
    List<ScheduleJob> out = new ArrayList<ScheduleJob>();
    for (ScheduleJobReadDto record : records) {
      out.add(toContract(record));
    }
    return out;
  }

  @GetMapping("/api/schedule-jobs/{jobId}")
  public ScheduleJob get(@PathVariable("jobId") String jobId) {
    ScheduleJobReadDto record = scheduleJobAppService.get(jobId);
    return toContract(record);
  }

  @PostMapping("/api/schedule-jobs")
  public ScheduleJob create(
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody CreateScheduleJobCommand body) {
    ScheduleJobReadDto record = scheduleJobAppService.create(body, idempotencyKey);
    return toContract(record);
  }

  private static ScheduleJob toContract(ScheduleJobReadDto record) {
    ScheduleJob dto = new ScheduleJob();
    dto.setId(record.getId());
    dto.setTaskGroupId(record.getTaskGroupId());
    dto.setTaskId(record.getTaskId());
    dto.setTriggerType(record.getTriggerType());
    dto.setStatus(record.getStatus());
    dto.setStartedAt(record.getStartedAt());
    dto.setEndedAt(record.getEndedAt());
    dto.setOperator(record.getOperator());
    dto.setLogRef(record.getLogRef());
    return dto;
  }
}
