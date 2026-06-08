package com.huatai.datafoundry.scheduler.schedule.application.handler;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.scheduler.schedule.application.event.ScheduleJobCreatedEvent;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.AgentGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class ScheduleJobCreatedHandlerTest {

  @Test
  void ignoresRuleDispatchRecords() {
    ScheduleJobRepository repository = Mockito.mock(ScheduleJobRepository.class);
    AgentGateway agentGateway = Mockito.mock(AgentGateway.class);
    BackendGateway backendGateway = Mockito.mock(BackendGateway.class);
    ScheduleJobCreatedHandler handler =
        new ScheduleJobCreatedHandler(repository, agentGateway, backendGateway);

    ScheduleJob record = new ScheduleJob();
    record.setId("job-1");
    record.setJobSource("RULE_DISPATCH");
    when(repository.get("job-1")).thenReturn(record);

    handler.onCreated(new ScheduleJobCreatedEvent("job-1"));

    verify(agentGateway, never()).execute(any(), any());
    verify(backendGateway, never()).callbackExecutionResult(any(), any());
  }
}
