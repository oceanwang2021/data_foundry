package com.huatai.datafoundry.scheduler.schedule.application.service;

import com.huatai.datafoundry.scheduler.schedule.application.dto.CreateScheduleJobCommand;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleJobReadDto;
import com.huatai.datafoundry.scheduler.schedule.application.event.ScheduleJobCreatedEvent;
import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ScheduleJobAppService {
  private final ScheduleJobRepository scheduleJobRepository;
  private final ApplicationEventPublisher eventPublisher;

  public ScheduleJobAppService(ScheduleJobRepository scheduleJobRepository, ApplicationEventPublisher eventPublisher) {
    this.scheduleJobRepository = scheduleJobRepository;
    this.eventPublisher = eventPublisher;
  }

  public List<ScheduleJobReadDto> list(String triggerType, String status) {
    List<ScheduleJob> records = scheduleJobRepository.list(triggerType, status);
    List<ScheduleJobReadDto> out = new ArrayList<ScheduleJobReadDto>();
    if (records == null) return out;
    for (ScheduleJob record : records) {
      if (record == null) continue;
      out.add(toReadDto(record));
    }
    return out;
  }

  public ScheduleJobReadDto get(String jobId) {
    ScheduleJob record = scheduleJobRepository.get(jobId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "ScheduleJob not found");
    }
    return toReadDto(record);
  }

  @Transactional
  public ScheduleJobReadDto create(CreateScheduleJobCommand body, String idempotencyKey) {
    if (body == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid schedule job request");
    }

    String id = resolveId(idempotencyKey);
    ScheduleJob existing = scheduleJobRepository.get(id);
    if (existing != null) {
      return toReadDto(existing);
    }

    String startedAt = Instant.now().toString();
    String triggerType = body.getTriggerType() != null && body.getTriggerType().trim().length() > 0
        ? body.getTriggerType().trim()
        : "manual";
    String operator = body.getOperator() != null && body.getOperator().trim().length() > 0
        ? body.getOperator().trim()
        : "manual";

    ScheduleJob record = new ScheduleJob();
    record.setId(id);
    record.setTaskGroupId(body.getTaskGroupId());
    record.setTaskId(body.getTaskId());
    record.setTriggerType(triggerType);
    record.setStatus("running");
    record.setStartedAt(startedAt);
    record.setEndedAt(null);
    record.setOperator(operator);
    record.setLogRef("log://scheduler/" + id);
    scheduleJobRepository.insert(record);

    eventPublisher.publishEvent(new ScheduleJobCreatedEvent(id));
    return toReadDto(record);
  }

  private static ScheduleJobReadDto toReadDto(ScheduleJob record) {
    ScheduleJobReadDto dto = new ScheduleJobReadDto();
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

  private static String resolveId(String idempotencyKey) {
    if (idempotencyKey == null || idempotencyKey.trim().isEmpty()) {
      return UUID.randomUUID().toString();
    }
    UUID uuid = UUID.nameUUIDFromBytes(("schedule-job:" + idempotencyKey.trim()).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    return uuid.toString();
  }
}
