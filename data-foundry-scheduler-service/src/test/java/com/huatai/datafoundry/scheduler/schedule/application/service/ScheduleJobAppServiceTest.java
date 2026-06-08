package com.huatai.datafoundry.scheduler.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.scheduler.schedule.application.dto.CreateScheduleJobCommand;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleJobReadDto;
import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.context.ApplicationEventPublisher;

class ScheduleJobAppServiceTest {

  @Test
  void listPassesExtendedFiltersAndMapsRuntimeFields() {
    ScheduleJobRepository repository = Mockito.mock(ScheduleJobRepository.class);
    ScheduleJob record = new ScheduleJob();
    record.setId("job-1");
    record.setTaskGroupId("tg-1");
    record.setJobSource("RULE_DISPATCH");
    record.setScheduleRuleId("rule-1");
    record.setBusinessDate("2026-05");
    record.setRequestPayload("{}");
    record.setErrorMessage("none");
    when(
            repository.list(
                "SCHEDULE", "FAILED", "tg-1", "rule-1", "RULE_DISPATCH"))
        .thenReturn(Collections.singletonList(record));
    ScheduleJobAppService service =
        new ScheduleJobAppService(
            repository, Mockito.mock(ApplicationEventPublisher.class));

    ScheduleJobReadDto result =
        service
            .list("SCHEDULE", "FAILED", "tg-1", "rule-1", "RULE_DISPATCH")
            .get(0);

    assertEquals("RULE_DISPATCH", result.getJobSource());
    assertEquals("rule-1", result.getScheduleRuleId());
    assertEquals("2026-05", result.getBusinessDate());
    assertEquals("{}", result.getRequestPayload());
    assertEquals("none", result.getErrorMessage());
  }

  @Test
  void ruleDispatchJobDoesNotPublishTaskExecutionEvent() {
    ScheduleJobRepository repository = Mockito.mock(ScheduleJobRepository.class);
    ApplicationEventPublisher eventPublisher = Mockito.mock(ApplicationEventPublisher.class);
    ScheduleJobAppService service = new ScheduleJobAppService(repository, eventPublisher);

    CreateScheduleJobCommand command = new CreateScheduleJobCommand();
    command.setJobSource("RULE_DISPATCH");
    command.setScheduleRuleId("rule-1");
    command.setBusinessDate("2026-05");
    command.setRequestPayload("{\"ruleId\":\"rule-1\"}");
    command.setTriggerType("SCHEDULE");
    command.setOperator("system");

    ScheduleJobReadDto result = service.create(command, "rule-dispatch-1");

    ArgumentCaptor<ScheduleJob> captor = ArgumentCaptor.forClass(ScheduleJob.class);
    verify(repository).insert(captor.capture());
    assertEquals("RULE_DISPATCH", captor.getValue().getJobSource());
    assertEquals("rule-1", result.getScheduleRuleId());
    verify(eventPublisher, never()).publishEvent(any());
  }
}
