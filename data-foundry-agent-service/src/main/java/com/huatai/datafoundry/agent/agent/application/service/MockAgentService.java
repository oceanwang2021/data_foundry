package com.huatai.datafoundry.agent.agent.application.service;

import com.huatai.datafoundry.contract.agent.AgentExecutionRequest;
import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;
import com.huatai.datafoundry.contract.agent.AgentIndicatorResult;
import com.huatai.datafoundry.contract.agent.NarrowIndicatorRow;
import com.huatai.datafoundry.contract.agent.RetrievalTaskResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.springframework.stereotype.Service;

@Service
public class MockAgentService {
  private final Random random = new Random();

  public AgentExecutionResponse execute(AgentExecutionRequest request) {
    long started = System.currentTimeMillis();
    int latencyMs = readIntEnv("AGENT_MOCK_LATENCY_MS", 120);
    double failureRate = readDoubleEnv("AGENT_MOCK_FAILURE_RATE", 0.0);

    sleepQuietly(latencyMs);

    AgentExecutionResponse response = new AgentExecutionResponse();
    response.setTaskId(request.getTaskId());

    if (random.nextDouble() < failureRate) {
      response.setStatus("failed");
      response.setIndicators(new ArrayList<AgentIndicatorResult>());
      response.setRetrievalTasks(new ArrayList<RetrievalTaskResult>());
      response.setDurationMs((int) (System.currentTimeMillis() - started));
      response.setErrorMessage("Mock: simulated failure");
      return response;
    }

    List<AgentIndicatorResult> indicators = new ArrayList<AgentIndicatorResult>();
    List<RetrievalTaskResult> retrievalTasks = new ArrayList<RetrievalTaskResult>();
    if (request.getIndicatorKeys() != null) {
      for (String key : request.getIndicatorKeys()) {
        AgentIndicatorResult indicator = new AgentIndicatorResult();
        indicator.setIndicatorKey(key);
        indicator.setConfidence(0.6 + random.nextDouble() * 0.35);
        indicator.setDataSource("mock");
        indicator.setSourceUrl("https://example.com/mock");
        indicator.setSourceLink("https://example.com/mock");
        indicator.setQuoteText("Mock quote for " + key);
        indicator.setValue(generateValue(key));
        indicator.setValueDescription("mock value");
        indicators.add(indicator);

        RetrievalTaskResult retrieval = new RetrievalTaskResult();
        retrieval.setIndicatorKey(key);
        retrieval.setQuery(buildQuery(key, request));
        retrieval.setStatus("completed");
        retrieval.setConfidence(indicator.getConfidence());
        NarrowIndicatorRow narrow = new NarrowIndicatorRow();
        narrow.setIndicatorKey(key);
        narrow.setIndicatorName(request.getIndicatorNames() != null ? request.getIndicatorNames().get(key) : key);
        narrow.setValue(indicator.getValue());
        narrow.setUnit(request.getIndicatorUnits() != null ? request.getIndicatorUnits().get(key) : "");
        narrow.setSourceUrl(indicator.getSourceUrl());
        narrow.setSourceSite("mock");
        narrow.setQuoteText(indicator.getQuoteText());
        narrow.setDimensionValues(request.getDimensionValues());
        retrieval.setNarrowRow(narrow);
        retrievalTasks.add(retrieval);
      }
    }

    response.setStatus("completed");
    response.setIndicators(indicators);
    response.setRetrievalTasks(retrievalTasks);
    response.setDurationMs((int) (System.currentTimeMillis() - started));
    response.setErrorMessage(null);
    return response;
  }

  private String buildQuery(String indicatorKey, AgentExecutionRequest request) {
    String base = indicatorKey;
    if (request.getDimensionValues() == null || request.getDimensionValues().isEmpty()) {
      return base;
    }
    return base + " " + request.getDimensionValues().toString();
  }

  private String generateValue(String key) {
    String normalized = key == null ? "" : key.toLowerCase();
    if (normalized.contains("ratio") || normalized.contains("pct") || normalized.contains("percent")) {
      return String.format("%.2f", random.nextDouble() * 100.0);
    }
    if (normalized.contains("price") || normalized.contains("amount") || normalized.contains("value")) {
      return String.format("%.2f", 10.0 + random.nextDouble() * 1000.0);
    }
    return String.valueOf(1 + random.nextInt(999));
  }

  private static int readIntEnv(String key, int defaultValue) {
    String raw = System.getenv(key);
    if (raw == null) return defaultValue;
    try {
      return Integer.parseInt(raw.trim());
    } catch (Exception ignored) {
      return defaultValue;
    }
  }

  private static double readDoubleEnv(String key, double defaultValue) {
    String raw = System.getenv(key);
    if (raw == null) return defaultValue;
    try {
      return Double.parseDouble(raw.trim());
    } catch (Exception ignored) {
      return defaultValue;
    }
  }

  private static void sleepQuietly(int ms) {
    if (ms <= 0) return;
    try {
      Thread.sleep(ms);
    } catch (InterruptedException ignored) {
      Thread.currentThread().interrupt();
    }
  }
}
