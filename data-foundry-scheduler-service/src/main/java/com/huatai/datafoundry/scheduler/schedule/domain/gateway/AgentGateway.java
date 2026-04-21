package com.huatai.datafoundry.scheduler.schedule.domain.gateway;

import com.huatai.datafoundry.contract.agent.AgentExecutionRequest;
import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;

public interface AgentGateway {
  AgentExecutionResponse execute(AgentExecutionRequest request, String idempotencyKey);
}

