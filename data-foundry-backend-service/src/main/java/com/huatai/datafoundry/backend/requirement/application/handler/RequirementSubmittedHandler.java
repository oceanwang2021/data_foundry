package com.huatai.datafoundry.backend.requirement.application.handler;

import com.huatai.datafoundry.backend.requirement.application.event.RequirementSubmittedEvent;
import com.huatai.datafoundry.backend.task.application.service.TaskPlanAppService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class RequirementSubmittedHandler {
  private final TaskPlanAppService taskPlanAppService;

  public RequirementSubmittedHandler(TaskPlanAppService taskPlanAppService) {
    this.taskPlanAppService = taskPlanAppService;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onSubmitted(RequirementSubmittedEvent event) {
    if (event == null || event.getRequirementId() == null) return;
    try {
      taskPlanAppService.ensureDefaultTaskGroupsOnSubmit(event.getRequirementId());
    } catch (Exception ignored) {
      // Do not fail submit because of task plan generation.
    }
  }
}
