package com.huatai.datafoundry.backend.ops.application.query.service;

import com.huatai.datafoundry.backend.requirement.application.service.AcceptanceTicketAppService;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import com.huatai.datafoundry.backend.task.application.service.TaskGroupAggregateService;
import com.huatai.datafoundry.backend.task.domain.gateway.ScheduleJobGateway;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJob;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class OpsMonitoringQueryService {
  private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
  private static final Set<String> COLLECTION_COMPLETED_STATUSES =
      new LinkedHashSet<String>(Arrays.asList(TaskStatus.COMPLETED, "partial"));
  private static final Set<String> TASK_GROUP_EXCEPTION_STATUSES =
      new LinkedHashSet<String>(Arrays.asList(TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.INVALIDATED));
  private static final Set<String> TASK_EXCEPTION_STATUSES =
      new LinkedHashSet<String>(Arrays.asList(TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.INVALIDATED));
  private static final Set<String> APPROVED_TICKET_STATUSES =
      new LinkedHashSet<String>(Arrays.asList("approved", "partial_approved"));
  private static final Set<String> REJECTED_TICKET_STATUSES =
      new LinkedHashSet<String>(Arrays.asList("rejected", "fixing", "publish_failed"));
  private static final Set<String> PENDING_REVIEW_TICKET_STATUSES =
      new LinkedHashSet<String>(Arrays.asList("pending", "publishing"));

  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final AcceptanceTicketAppService acceptanceTicketAppService;
  private final TaskGroupAggregateService taskGroupAggregateService;
  private final ScheduleJobGateway scheduleJobGateway;
  private final JdbcTemplate jdbcTemplate;
  private final RestTemplate schedulerRestTemplate;
  private final RestTemplate collectionRestTemplate;
  private final String schedulerBaseUrl;
  private final String collectionBaseUrl;

  public OpsMonitoringQueryService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      AcceptanceTicketAppService acceptanceTicketAppService,
      TaskGroupAggregateService taskGroupAggregateService,
      ScheduleJobGateway scheduleJobGateway,
      JdbcTemplate jdbcTemplate,
      @Qualifier("schedulerRestTemplate") RestTemplate schedulerRestTemplate,
      @Qualifier("collectionRestTemplate") RestTemplate collectionRestTemplate,
      @Value("${data-foundry.scheduler.base-url:http://127.0.0.1:8200}") String schedulerBaseUrl,
      @Value("${data-foundry.collection.base-url:http://118.196.116.160:3000}") String collectionBaseUrl) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.acceptanceTicketAppService = acceptanceTicketAppService;
    this.taskGroupAggregateService = taskGroupAggregateService;
    this.scheduleJobGateway = scheduleJobGateway;
    this.jdbcTemplate = jdbcTemplate;
    this.schedulerRestTemplate = schedulerRestTemplate;
    this.collectionRestTemplate = collectionRestTemplate;
    this.schedulerBaseUrl = schedulerBaseUrl;
    this.collectionBaseUrl = collectionBaseUrl;
  }

  public Map<String, Object> getMonitoringSummary(boolean includeTrial) {
    MonitoringContext context = buildContext(includeTrial);
    Map<String, Object> taskMonitoring = buildTaskMonitoring(context);
    Map<String, Object> dataMonitoring = buildDataMonitoring(context);
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    String generatedAt = formatDateTime(LocalDateTime.now());
    out.put("generated_at", generatedAt);
    out.put("generatedAt", generatedAt);
    out.put("overview", buildOverview(context));
    out.put("service_health", context.serviceHealthItems);
    out.put("serviceHealth", context.serviceHealthItems);
    out.put("task_monitoring", taskMonitoring);
    out.put("taskMonitoring", taskMonitoring);
    out.put("data_monitoring", dataMonitoring);
    out.put("dataMonitoring", dataMonitoring);
    List<Map<String, Object>> riskCards = buildRiskCards(context);
    out.put("risk_cards", riskCards);
    out.put("riskCards", riskCards);
    return out;
  }

  public List<Map<String, Object>> listOpsOverview(boolean includeTrial) {
    MonitoringContext context = buildContext(includeTrial);
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    for (Map<String, Object> item : context.serviceHealthItems) {
      Map<String, Object> row = new LinkedHashMap<String, Object>();
      row.put("environment", item.get("service"));
      row.put("stage", item.get("label"));
      row.put("status", item.get("status"));
      row.put("running_tasks", Integer.valueOf(context.taskRunningCount));
      row.put("runningTasks", Integer.valueOf(context.taskRunningCount));
      row.put("failed_tasks", Integer.valueOf(context.taskExceptionCount));
      row.put("failedTasks", Integer.valueOf(context.taskExceptionCount));
      out.add(row);
    }
    return out;
  }

  public List<Map<String, Object>> listTaskStatusCounts(boolean includeTrial) {
    MonitoringContext context = buildContext(includeTrial);
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    out.add(countRow("待执行", context.taskPendingCount));
    out.add(countRow("运行中", context.taskRunningCount));
    out.add(countRow("已完成", context.taskCompletedCount));
    out.add(countRow("异常", context.taskExceptionCount));
    return out;
  }

  public List<Map<String, Object>> listDataStatusCounts(boolean includeTrial) {
    MonitoringContext context = buildContext(includeTrial);
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    out.add(countRow("待采集", context.pendingCollectionCount));
    out.add(countRow("待审核", context.pendingReviewCount));
    out.add(countRow("已完成", context.completedDataCount));
    out.add(countRow("异常", context.exceptionDataCount));
    return out;
  }

  private MonitoringContext buildContext(boolean includeTrial) {
    List<TaskGroup> rawTaskGroups = safeTaskGroups(taskGroupRepository.listAll());
    List<FetchTask> rawFetchTasks = safeFetchTasks(fetchTaskRepository.listAll());
    refreshStaleTaskGroups(rawTaskGroups, rawFetchTasks);

    List<TaskGroup> taskGroups = safeTaskGroups(taskGroupRepository.listAll());
    List<FetchTask> fetchTasks = safeFetchTasks(fetchTaskRepository.listAll());
    Map<String, AcceptanceTicketRecord> acceptanceTicketByTaskGroupId =
        indexTicketsByTaskGroupId(acceptanceTicketAppService.list(null));
    List<ScheduleJob> scheduleJobs = safeScheduleJobs();

    MonitoringContext context = new MonitoringContext();
    context.taskGroups = filterTaskGroups(taskGroups, includeTrial);
    context.fetchTasks = filterFetchTasks(fetchTasks, includeTrial, context.taskGroups);
    context.acceptanceTicketByTaskGroupId = acceptanceTicketByTaskGroupId;
    context.scheduleJobs = scheduleJobs;
    deriveTaskMetrics(context);
    deriveDataMetrics(context);
    context.serviceHealthItems = buildServiceHealth(context);
    return context;
  }

  private void refreshStaleTaskGroups(List<TaskGroup> taskGroups, List<FetchTask> fetchTasks) {
    if (taskGroups.isEmpty()) {
      return;
    }
    Map<String, LocalDateTime> latestTaskUpdateByTaskGroupId = new LinkedHashMap<String, LocalDateTime>();
    for (FetchTask fetchTask : fetchTasks) {
      if (fetchTask == null || isBlank(fetchTask.getTaskGroupId()) || fetchTask.getUpdatedAt() == null) {
        continue;
      }
      LocalDateTime current = latestTaskUpdateByTaskGroupId.get(fetchTask.getTaskGroupId());
      if (current == null || fetchTask.getUpdatedAt().isAfter(current)) {
        latestTaskUpdateByTaskGroupId.put(fetchTask.getTaskGroupId(), fetchTask.getUpdatedAt());
      }
    }

    List<String> staleTaskGroupIds = new ArrayList<String>();
    for (TaskGroup taskGroup : taskGroups) {
      if (taskGroup == null || isBlank(taskGroup.getId())) {
        continue;
      }
      LocalDateTime latestTaskUpdate = latestTaskUpdateByTaskGroupId.get(taskGroup.getId());
      if (taskGroup.getLastAggregatedAt() == null) {
        staleTaskGroupIds.add(taskGroup.getId());
        continue;
      }
      if (latestTaskUpdate != null && latestTaskUpdate.isAfter(taskGroup.getLastAggregatedAt())) {
        staleTaskGroupIds.add(taskGroup.getId());
      }
    }
    if (!staleTaskGroupIds.isEmpty()) {
      taskGroupAggregateService.refreshTaskGroups(staleTaskGroupIds);
    }
  }

  private void deriveTaskMetrics(MonitoringContext context) {
    for (FetchTask fetchTask : context.fetchTasks) {
      String status = normalize(fetchTask != null ? fetchTask.getStatus() : null);
      if (TaskStatus.COMPLETED.equals(status)) {
        context.taskCompletedCount++;
      } else if (TaskStatus.RUNNING.equals(status)) {
        context.taskRunningCount++;
      } else if (TASK_EXCEPTION_STATUSES.contains(status)) {
        context.taskExceptionCount++;
      } else {
        context.taskPendingCount++;
      }
    }
  }

  private void deriveDataMetrics(MonitoringContext context) {
    for (TaskGroup taskGroup : context.taskGroups) {
      AcceptanceTicketRecord ticket = context.acceptanceTicketByTaskGroupId.get(taskGroup.getId());
      String taskGroupStatus = normalize(taskGroup.getStatus());
      String ticketStatus = normalize(ticket != null ? ticket.getStatus() : null);

      if (REJECTED_TICKET_STATUSES.contains(ticketStatus) || TASK_GROUP_EXCEPTION_STATUSES.contains(taskGroupStatus)) {
        context.exceptionDataCount++;
        continue;
      }
      if (APPROVED_TICKET_STATUSES.contains(ticketStatus)) {
        context.completedDataCount++;
        continue;
      }
      if (COLLECTION_COMPLETED_STATUSES.contains(taskGroupStatus) || PENDING_REVIEW_TICKET_STATUSES.contains(ticketStatus)) {
        context.pendingReviewCount++;
        continue;
      }
      context.pendingCollectionCount++;
    }
  }

  private Map<String, Object> buildOverview(MonitoringContext context) {
    int totalTasks = context.fetchTasks.size();
    int totalDataUnits = context.taskGroups.size();
    double taskCompletionRate = ratioPercent(context.taskCompletedCount, totalTasks);
    double dataCollectionRate = ratioPercent(
        context.pendingReviewCount + context.completedDataCount,
        totalDataUnits);
    double dataReviewRate = ratioPercent(context.completedDataCount, totalDataUnits);
    double serviceScore = averageServiceScore(context.serviceHealthItems);
    double taskSuccessRate = ratioPercent(
        context.taskCompletedCount,
        context.taskCompletedCount + context.taskExceptionCount);
    double healthScore =
        (serviceScore * 0.35d)
            + (taskSuccessRate * 0.40d)
            + (dataReviewRate * 0.25d);

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("health_score", Integer.valueOf((int) Math.round(healthScore)));
    out.put("healthScore", Integer.valueOf((int) Math.round(healthScore)));
    out.put("task_completion_rate", roundPercent(taskCompletionRate));
    out.put("taskCompletionRate", roundPercent(taskCompletionRate));
    out.put("data_collection_rate", roundPercent(dataCollectionRate));
    out.put("dataCollectionRate", roundPercent(dataCollectionRate));
    out.put("data_review_rate", roundPercent(dataReviewRate));
    out.put("dataReviewRate", roundPercent(dataReviewRate));
    return out;
  }

  private Map<String, Object> buildTaskMonitoring(MonitoringContext context) {
    int totalTasks = context.fetchTasks.size();
    double completionRate = ratioPercent(context.taskCompletedCount, totalTasks);
    int decisiveTasks = context.taskCompletedCount + context.taskExceptionCount;
    double successRate = ratioPercent(context.taskCompletedCount, decisiveTasks);

    List<Map<String, Object>> statusCounts = new ArrayList<Map<String, Object>>();
    statusCounts.add(distributionRow("pending", "待执行", context.taskPendingCount, totalTasks));
    statusCounts.add(distributionRow("running", "运行中", context.taskRunningCount, totalTasks));
    statusCounts.add(distributionRow("completed", "已完成", context.taskCompletedCount, totalTasks));
    statusCounts.add(distributionRow("exception", "异常", context.taskExceptionCount, totalTasks));

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("total", Integer.valueOf(totalTasks));
    out.put("completion_rate", roundPercent(completionRate));
    out.put("completionRate", roundPercent(completionRate));
    out.put("running_task_count", Integer.valueOf(context.taskRunningCount));
    out.put("runningTaskCount", Integer.valueOf(context.taskRunningCount));
    out.put("failed_task_count", Integer.valueOf(context.taskExceptionCount));
    out.put("failedTaskCount", Integer.valueOf(context.taskExceptionCount));
    out.put("success_rate", roundPercent(successRate));
    out.put("successRate", roundPercent(successRate));
    out.put("status_counts", statusCounts);
    out.put("statusCounts", statusCounts);
    return out;
  }

  private Map<String, Object> buildDataMonitoring(MonitoringContext context) {
    int totalUnits = context.taskGroups.size();
    int collectedUnits = context.pendingReviewCount + context.completedDataCount;
    int reviewedUnits = context.completedDataCount;
    int reviewedTicketCount = countReviewedTickets(context);
    double collectionRate = ratioPercent(collectedUnits, totalUnits);
    double reviewRate = ratioPercent(reviewedUnits, totalUnits);
    double approvalRate = ratioPercent(reviewedUnits, reviewedTicketCount);

    List<Map<String, Object>> stageCounts = new ArrayList<Map<String, Object>>();
    stageCounts.add(distributionRow("pending_collection", "待采集", context.pendingCollectionCount, totalUnits));
    stageCounts.add(distributionRow("pending_review", "待审核", context.pendingReviewCount, totalUnits));
    stageCounts.add(distributionRow("completed", "已完成", context.completedDataCount, totalUnits));
    stageCounts.add(distributionRow("exception", "异常", context.exceptionDataCount, totalUnits));

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("total_units", Integer.valueOf(totalUnits));
    out.put("totalUnits", Integer.valueOf(totalUnits));
    out.put("collection_rate", roundPercent(collectionRate));
    out.put("collectionRate", roundPercent(collectionRate));
    out.put("review_rate", roundPercent(reviewRate));
    out.put("reviewRate", roundPercent(reviewRate));
    out.put("approval_rate", roundPercent(approvalRate));
    out.put("approvalRate", roundPercent(approvalRate));
    out.put("stage_counts", stageCounts);
    out.put("stageCounts", stageCounts);
    return out;
  }

  private List<Map<String, Object>> buildRiskCards(MonitoringContext context) {
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    if (context.taskExceptionCount > 0) {
      out.add(riskCard(
          "task_failed",
          "采集异常",
          "high",
          context.taskExceptionCount,
          "存在失败、取消或失效任务，需要优先排查采集链路",
          "/collection-tasks"));
    }
    if (context.pendingReviewCount > 0) {
      out.add(riskCard(
          "acceptance_backlog",
          "审核积压",
          "medium",
          context.pendingReviewCount,
          "已有采集结果但尚未完成验收，可能影响交付闭环",
          "/acceptance"));
    }
    int serviceAlertCount = countServiceAlerts(context.serviceHealthItems);
    if (serviceAlertCount > 0) {
      out.add(riskCard(
          "service_alert",
          "系统告警",
          "medium",
          serviceAlertCount,
          "存在服务探活异常或下游不可用，需要关注系统健康",
          "/ops-monitoring"));
    }
    if (out.isEmpty()) {
      out.add(riskCard(
          "healthy",
          "运行平稳",
          "low",
          0,
          "当前未发现需要立即处理的运行风险",
          "/ops-monitoring"));
    }
    return out;
  }

  private List<Map<String, Object>> buildServiceHealth(MonitoringContext context) {
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    out.add(probeBackendHealth());
    out.add(probeRemoteHealth(
        "scheduler",
        "调度服务",
        schedulerRestTemplate,
        schedulerBaseUrl,
        summarizeScheduleJobs(context.scheduleJobs)));
    out.add(probeRemoteHealth(
        "collection",
        "采集服务",
        collectionRestTemplate,
        collectionBaseUrl,
        "用于创建采集任务、同步任务状态与读取采集结果"));
    return out;
  }

  private Map<String, Object> probeBackendHealth() {
    try {
      jdbcTemplate.queryForObject("select 1", Integer.class);
      return serviceHealth("backend", "后端服务", "healthy", "接口可用，数据库连接正常");
    } catch (Exception ex) {
      return serviceHealth("backend", "后端服务", "error", "数据库探测失败: " + safeMessage(ex));
    }
  }

  private Map<String, Object> probeRemoteHealth(
      String service,
      String label,
      RestTemplate restTemplate,
      String baseUrl,
      String successDetail) {
    String normalizedBaseUrl = trimToNull(baseUrl);
    if (normalizedBaseUrl == null) {
      return serviceHealth(service, label, "warning", "未配置服务地址，无法执行健康探测");
    }
    try {
      ResponseEntity<Map> response = restTemplate.getForEntity(normalizedBaseUrl + "/health", Map.class);
      if (response.getStatusCode().is2xxSuccessful()) {
        String status = successDetail.contains("失败调度作业") ? "warning" : "healthy";
        return serviceHealth(service, label, status, successDetail);
      }
      return serviceHealth(service, label, "warning", "健康检查返回非成功状态: " + response.getStatusCode().value());
    } catch (HttpStatusCodeException ex) {
      HttpStatus status = HttpStatus.resolve(ex.getRawStatusCode());
      if (status == HttpStatus.NOT_FOUND) {
        return serviceHealth(service, label, "warning", "服务未提供 /health 探针，无法确认健康状态");
      }
      return serviceHealth(
          service,
          label,
          "error",
          "健康检查失败: HTTP " + ex.getRawStatusCode() + safeMessage(ex));
    } catch (RestClientException ex) {
      return serviceHealth(service, label, "error", "健康检查失败: " + safeMessage(ex));
    }
  }

  private String summarizeScheduleJobs(List<ScheduleJob> jobs) {
    if (jobs == null || jobs.isEmpty()) {
      return "健康检查通过，当前无调度作业积压";
    }
    int runningCount = 0;
    int failedCount = 0;
    for (ScheduleJob job : jobs) {
      String status = normalize(job != null ? job.getStatus() : null);
      if ("running".equals(status) || "queued".equals(status)) {
        runningCount++;
      }
      if ("failed".equals(status)) {
        failedCount++;
      }
    }
    if (failedCount > 0) {
      return "近一次探测成功，但存在 " + failedCount + " 个失败调度作业";
    }
    if (runningCount > 0) {
      return "健康检查通过，当前有 " + runningCount + " 个运行中或排队中的调度作业";
    }
    return "健康检查通过，调度作业状态正常";
  }

  private Map<String, Object> serviceHealth(String service, String label, String status, String detail) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("service", service);
    out.put("label", label);
    out.put("status", status);
    out.put("detail", detail);
    return out;
  }

  private Map<String, Object> countRow(String status, int count) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("status", status);
    out.put("count", Integer.valueOf(count));
    return out;
  }

  private Map<String, Object> distributionRow(String status, String label, int count, int total) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("status", status);
    out.put("label", label);
    out.put("count", Integer.valueOf(count));
    out.put("ratio", roundPercent(ratioPercent(count, total)));
    return out;
  }

  private Map<String, Object> riskCard(
      String code, String label, String severity, int count, String description, String target) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("code", code);
    out.put("label", label);
    out.put("severity", severity);
    out.put("count", Integer.valueOf(count));
    out.put("description", description);
    out.put("target", target);
    return out;
  }

  private List<TaskGroup> filterTaskGroups(List<TaskGroup> taskGroups, boolean includeTrial) {
    if (taskGroups.isEmpty()) {
      return taskGroups;
    }
    List<TaskGroup> out = new ArrayList<TaskGroup>();
    for (TaskGroup taskGroup : taskGroups) {
      if (taskGroup == null) {
        continue;
      }
      if (!includeTrial && "trial".equals(normalize(taskGroup.getTriggeredBy()))) {
        continue;
      }
      out.add(taskGroup);
    }
    return out;
  }

  private List<FetchTask> filterFetchTasks(
      List<FetchTask> fetchTasks, boolean includeTrial, List<TaskGroup> taskGroups) {
    if (fetchTasks.isEmpty()) {
      return fetchTasks;
    }
    Map<String, TaskGroup> taskGroupById = new LinkedHashMap<String, TaskGroup>();
    for (TaskGroup taskGroup : taskGroups) {
      if (taskGroup != null && !isBlank(taskGroup.getId())) {
        taskGroupById.put(taskGroup.getId(), taskGroup);
      }
    }
    List<FetchTask> out = new ArrayList<FetchTask>();
    for (FetchTask fetchTask : fetchTasks) {
      if (fetchTask == null) {
        continue;
      }
      if (!includeTrial) {
        TaskGroup taskGroup = taskGroupById.get(fetchTask.getTaskGroupId());
        if (taskGroup == null && !isBlank(fetchTask.getTaskGroupId())) {
          continue;
        }
      }
      out.add(fetchTask);
    }
    return out;
  }

  private List<TaskGroup> safeTaskGroups(List<TaskGroup> taskGroups) {
    return taskGroups != null ? taskGroups : Collections.<TaskGroup>emptyList();
  }

  private List<FetchTask> safeFetchTasks(List<FetchTask> fetchTasks) {
    return fetchTasks != null ? fetchTasks : Collections.<FetchTask>emptyList();
  }

  private List<ScheduleJob> safeScheduleJobs() {
    try {
      List<ScheduleJob> jobs = scheduleJobGateway.list(null, null);
      return jobs != null ? jobs : Collections.<ScheduleJob>emptyList();
    } catch (Exception ex) {
      return Collections.<ScheduleJob>emptyList();
    }
  }

  private Map<String, AcceptanceTicketRecord> indexTicketsByTaskGroupId(List<AcceptanceTicketRecord> tickets) {
    Map<String, AcceptanceTicketRecord> out = new LinkedHashMap<String, AcceptanceTicketRecord>();
    if (tickets == null) {
      return out;
    }
    for (AcceptanceTicketRecord ticket : tickets) {
      if (ticket == null || isBlank(ticket.getTaskGroupId())) {
        continue;
      }
      out.put(ticket.getTaskGroupId(), ticket);
    }
    return out;
  }

  private int countReviewedTickets(MonitoringContext context) {
    int count = 0;
    for (TaskGroup taskGroup : context.taskGroups) {
      AcceptanceTicketRecord ticket = context.acceptanceTicketByTaskGroupId.get(taskGroup.getId());
      String status = normalize(ticket != null ? ticket.getStatus() : null);
      if (APPROVED_TICKET_STATUSES.contains(status) || REJECTED_TICKET_STATUSES.contains(status)) {
        count++;
      }
    }
    return count;
  }

  private int countServiceAlerts(List<Map<String, Object>> serviceHealthItems) {
    int count = 0;
    for (Map<String, Object> item : serviceHealthItems) {
      String status = normalize(item != null ? String.valueOf(item.get("status")) : null);
      if ("warning".equals(status) || "error".equals(status)) {
        count++;
      }
    }
    return count;
  }

  private double averageServiceScore(List<Map<String, Object>> serviceHealthItems) {
    if (serviceHealthItems == null || serviceHealthItems.isEmpty()) {
      return 0d;
    }
    double total = 0d;
    for (Map<String, Object> item : serviceHealthItems) {
      String status = normalize(item != null ? String.valueOf(item.get("status")) : null);
      if ("healthy".equals(status)) {
        total += 100d;
      } else if ("warning".equals(status)) {
        total += 60d;
      } else {
        total += 0d;
      }
    }
    return total / serviceHealthItems.size();
  }

  private double ratioPercent(int numerator, int denominator) {
    if (denominator <= 0 || numerator <= 0) {
      return denominator <= 0 ? 0d : 0d;
    }
    return (numerator * 100d) / denominator;
  }

  private double roundPercent(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).doubleValue();
  }

  private String formatDateTime(LocalDateTime value) {
    return value != null ? value.format(DATE_TIME_FORMATTER) : null;
  }

  private String normalize(String value) {
    String trimmed = trimToNull(value);
    return trimmed != null ? trimmed.toLowerCase() : null;
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private boolean isBlank(String value) {
    return trimToNull(value) == null;
  }

  private String safeMessage(Exception ex) {
    String message = ex != null ? trimToNull(ex.getMessage()) : null;
    return message != null ? message : "unknown error";
  }

  private static final class MonitoringContext {
    private List<TaskGroup> taskGroups = Collections.emptyList();
    private List<FetchTask> fetchTasks = Collections.emptyList();
    private Map<String, AcceptanceTicketRecord> acceptanceTicketByTaskGroupId = Collections.emptyMap();
    private List<ScheduleJob> scheduleJobs = Collections.emptyList();
    private List<Map<String, Object>> serviceHealthItems = Collections.emptyList();
    private int taskPendingCount;
    private int taskRunningCount;
    private int taskCompletedCount;
    private int taskExceptionCount;
    private int pendingCollectionCount;
    private int pendingReviewCount;
    private int completedDataCount;
    private int exceptionDataCount;
  }
}
