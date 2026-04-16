package com.huatai.datafoundry.backend.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.persistence.RequirementMapper;
import com.huatai.datafoundry.backend.persistence.RequirementRecord;
import com.huatai.datafoundry.backend.persistence.WideTableMapper;
import com.huatai.datafoundry.backend.persistence.WideTableRecord;
import com.huatai.datafoundry.backend.service.TaskPlanService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/projects/{projectId}/requirements")
public class RequirementController {
  private final RequirementMapper mapper;
  private final WideTableMapper wideTableMapper;
  private final ObjectMapper objectMapper;
  private final TaskPlanService taskPlanService;

  public RequirementController(
      RequirementMapper mapper,
      WideTableMapper wideTableMapper,
      ObjectMapper objectMapper,
      TaskPlanService taskPlanService) {
    this.mapper = mapper;
    this.wideTableMapper = wideTableMapper;
    this.objectMapper = objectMapper;
    this.taskPlanService = taskPlanService;
  }

  @GetMapping
  public List<RequirementWithWideTableResponse> list(@PathVariable("projectId") String projectId) {
    List<RequirementRecord> records = mapper.listByProject(projectId);
    List<RequirementWithWideTableResponse> out = new ArrayList<RequirementWithWideTableResponse>();
    for (RequirementRecord record : records) {
      WideTableRecord wideTable = wideTableMapper.getPrimaryByRequirement(record.getId());
      out.add(RequirementWithWideTableResponse.from(record, wideTable, objectMapper));
    }
    return out;
  }

  @PostMapping
  @Transactional
  public RequirementWithWideTableResponse create(
      @PathVariable("projectId") String projectId,
      @RequestBody RequirementCreateRequest request) {
    if (request == null || request.getTitle() == null || request.getTitle().trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requirement title is required");
    }

    String requirementId = buildRequirementId();
    RequirementRecord record = new RequirementRecord();
    record.setId(requirementId);
    record.setProjectId(projectId);
    record.setTitle(request.getTitle().trim());
    record.setPhase(request.getPhase() != null ? request.getPhase() : "production");
    record.setStatus("draft");
    record.setSchemaLocked(Boolean.FALSE);
    record.setOwner(request.getOwner());
    record.setAssignee(request.getAssignee());
    record.setBusinessGoal(request.getBusinessGoal());
    record.setBackgroundKnowledge(request.getBackgroundKnowledge());
    record.setDeliveryScope(request.getDeliveryScope());
    record.setDataUpdateEnabled(request.getDataUpdateEnabled());
    record.setDataUpdateMode(request.getDataUpdateMode());

    if (request.getCollectionPolicy() != null) {
      try {
        record.setCollectionPolicy(objectMapper.writeValueAsString(request.getCollectionPolicy()));
      } catch (Exception ex) {
        record.setCollectionPolicy(null);
      }
    }

    mapper.insert(record);

    WideTableCreateRequest wideTableRequest = request.getWideTable();
    WideTableRecord wideTable = buildWideTableRecord(requirementId, record.getTitle(), wideTableRequest);
    wideTableMapper.insert(wideTable);

    RequirementRecord refreshed = mapper.get(projectId, requirementId);
    WideTableRecord primary = wideTableMapper.getPrimaryByRequirement(requirementId);
    return RequirementWithWideTableResponse.from(refreshed, primary, objectMapper);
  }

  private String buildRequirementId() {
    int year = LocalDate.now().getYear();
    String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    return String.format("REQ-%d-%s", year, token);
  }

  private WideTableRecord buildWideTableRecord(
      String requirementId,
      String requirementTitle,
      WideTableCreateRequest request) {
    int year = LocalDate.now().getYear();
    String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    String wideTableId = String.format("WT-%d-%s", year, token);

    WideTableRecord record = new WideTableRecord();
    record.setId(wideTableId);
    record.setSortOrder(0);
    record.setRequirementId(requirementId);
    record.setTitle(request != null && request.getTitle() != null && !request.getTitle().trim().isEmpty()
        ? request.getTitle().trim()
        : (requirementTitle + "宽表"));
    record.setDescription(request != null ? request.getDescription() : null);
    record.setTableName(request != null && request.getTableName() != null && !request.getTableName().trim().isEmpty()
        ? request.getTableName().trim()
        : ("wide_table_" + requirementId.replace("-", "_").toLowerCase()));
    record.setSchemaVersion(request != null && request.getSchemaVersion() != null ? request.getSchemaVersion() : 1);
    record.setSemanticTimeAxis(request != null ? request.getSemanticTimeAxis() : "business_date");
    record.setCollectionCoverageMode(request != null ? request.getCollectionCoverageMode() : "incremental_by_business_date");
    record.setStatus(request != null && request.getStatus() != null ? request.getStatus() : "draft");
    record.setRecordCount(0);

    try {
      Object schema = request != null ? request.getSchema() : null;
      if (schema == null) {
        schema = java.util.Collections.singletonMap("columns", java.util.Collections.emptyList());
      }
      record.setSchemaJson(objectMapper.writeValueAsString(schema));
    } catch (Exception ex) {
      record.setSchemaJson(null);
    }

    try {
      Object scope = request != null ? request.getScope() : null;
      record.setScopeJson(scope != null ? objectMapper.writeValueAsString(scope) : null);
    } catch (Exception ex) {
      record.setScopeJson(null);
    }

    try {
      Object indicatorGroups = request != null ? request.getIndicatorGroups() : null;
      record.setIndicatorGroupsJson(indicatorGroups != null ? objectMapper.writeValueAsString(indicatorGroups) : "[]");
    } catch (Exception ex) {
      record.setIndicatorGroupsJson("[]");
    }

    try {
      Object scheduleRules = request != null ? request.getScheduleRules() : null;
      record.setScheduleRulesJson(scheduleRules != null ? objectMapper.writeValueAsString(scheduleRules) : "[]");
    } catch (Exception ex) {
      record.setScheduleRulesJson("[]");
    }

    return record;
  }

  @GetMapping("/{requirementId}")
  public RequirementResponse get(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId) {
    RequirementRecord record = mapper.get(projectId, requirementId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    return RequirementResponse.from(record, objectMapper);
  }

  @PutMapping("/{requirementId}")
  public RequirementResponse update(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId,
      @RequestBody RequirementUpdateRequest request) {
    RequirementRecord existing = mapper.get(projectId, requirementId);
    if (existing == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }

    // When schema is locked, only allow status updates (e.g., ready -> running). Definition edits are blocked.
    if (Boolean.TRUE.equals(existing.getSchemaLocked()) && request.hasDefinitionEdits()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Requirement schema is locked");
    }

    RequirementRecord toUpdate = new RequirementRecord();
    toUpdate.setId(requirementId);
    toUpdate.setProjectId(projectId);
    toUpdate.setTitle(request.getTitle());
    toUpdate.setStatus(request.getStatus());
    toUpdate.setOwner(request.getOwner());
    toUpdate.setAssignee(request.getAssignee());
    toUpdate.setBusinessGoal(request.getBusinessGoal());
    toUpdate.setBackgroundKnowledge(request.getBackgroundKnowledge());
    toUpdate.setDeliveryScope(request.getDeliveryScope());
    toUpdate.setDataUpdateEnabled(request.getDataUpdateEnabled());
    toUpdate.setDataUpdateMode(request.getDataUpdateMode());

    if (request.getProcessingRuleDrafts() != null) {
      try {
        toUpdate.setProcessingRuleDrafts(objectMapper.writeValueAsString(request.getProcessingRuleDrafts()));
      } catch (Exception ex) {
        toUpdate.setProcessingRuleDrafts(null);
      }
    }

    // Submit semantics: moving to "ready" locks schema (no more edits).
    if ("ready".equalsIgnoreCase(request.getStatus())) {
      toUpdate.setSchemaLocked(true);
    }

    int updated = mapper.updateByProjectAndId(toUpdate);
    if (updated <= 0) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update requirement");
    }

    // On submit (draft/aligning -> ready), build default task instances so the "任务" tab has content immediately.
    // Sub-tasks are generated lazily when opening/executing a task instance.
    if ("ready".equalsIgnoreCase(request.getStatus())) {
      try {
        taskPlanService.ensureDefaultTaskGroupsOnSubmit(requirementId);
      } catch (Exception ignored) {
        // Do not fail submit because of task plan generation.
      }
    }

    RequirementRecord refreshed = mapper.get(projectId, requirementId);
    return RequirementResponse.from(refreshed, objectMapper);
  }

  public static class RequirementResponse {
    private String id;
    private String projectId;
    private String title;
    private String phase;
    private String status;
    private Boolean schemaLocked;
    private String owner;
    private String assignee;
    private String businessGoal;
    private String backgroundKnowledge;
    private String businessBoundary;
    private String deliveryScope;
    private Map<String, Object> collectionPolicy;
    private Boolean dataUpdateEnabled;
    private String dataUpdateMode;
    private Object createdAt;
    private Object updatedAt;

    public static RequirementResponse from(RequirementRecord record, ObjectMapper objectMapper) {
      RequirementResponse out = new RequirementResponse();
      out.id = record.getId();
      out.projectId = record.getProjectId();
      out.title = record.getTitle();
      out.phase = record.getPhase();
      out.status = record.getStatus();
      out.schemaLocked = record.getSchemaLocked();
      out.owner = record.getOwner();
      out.assignee = record.getAssignee();
      out.businessGoal = record.getBusinessGoal();
      out.backgroundKnowledge = record.getBackgroundKnowledge();
      out.businessBoundary = record.getBusinessBoundary();
      out.deliveryScope = record.getDeliveryScope();
      out.collectionPolicy = parseJsonObject(record.getCollectionPolicy(), objectMapper);
      out.dataUpdateEnabled = record.getDataUpdateEnabled();
      out.dataUpdateMode = record.getDataUpdateMode();
      out.createdAt = record.getCreatedAt();
      out.updatedAt = record.getUpdatedAt();
      return out;
    }

    static Map<String, Object> parseJsonObject(String raw, ObjectMapper objectMapper) {
      if (raw == null || raw.trim().isEmpty()) {
        return null;
      }
      try {
        return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
      } catch (Exception ex) {
        return null;
      }
    }

    public String getId() {
      return id;
    }

    public String getProjectId() {
      return projectId;
    }

    public String getTitle() {
      return title;
    }

    public String getPhase() {
      return phase;
    }

    public String getStatus() {
      return status;
    }

    public Boolean getSchemaLocked() {
      return schemaLocked;
    }

    public String getOwner() {
      return owner;
    }

    public String getAssignee() {
      return assignee;
    }

    public String getBusinessGoal() {
      return businessGoal;
    }

    public String getBackgroundKnowledge() {
      return backgroundKnowledge;
    }

    public String getBusinessBoundary() {
      return businessBoundary;
    }

    public String getDeliveryScope() {
      return deliveryScope;
    }

    public Map<String, Object> getCollectionPolicy() {
      return collectionPolicy;
    }

    public Boolean getDataUpdateEnabled() {
      return dataUpdateEnabled;
    }

    public String getDataUpdateMode() {
      return dataUpdateMode;
    }

    public Object getCreatedAt() {
      return createdAt;
    }

    public Object getUpdatedAt() {
      return updatedAt;
    }
  }

  public static class RequirementUpdateRequest {
    private String title;
    private String status;
    private String owner;
    private String assignee;
    private String businessGoal;
    private String backgroundKnowledge;
    private String deliveryScope;
    private Boolean dataUpdateEnabled;
    private String dataUpdateMode;
    private Object processingRuleDrafts;

    public boolean hasDefinitionEdits() {
      return title != null
          || owner != null
          || assignee != null
          || businessGoal != null
          || backgroundKnowledge != null
          || deliveryScope != null
          || dataUpdateEnabled != null
          || dataUpdateMode != null
          || processingRuleDrafts != null;
    }

    public String getTitle() {
      return title;
    }

    public void setTitle(String title) {
      this.title = title;
    }

    public String getStatus() {
      return status;
    }

    public void setStatus(String status) {
      this.status = status;
    }

    public String getOwner() {
      return owner;
    }

    public void setOwner(String owner) {
      this.owner = owner;
    }

    public String getAssignee() {
      return assignee;
    }

    public void setAssignee(String assignee) {
      this.assignee = assignee;
    }

    public String getBusinessGoal() {
      return businessGoal;
    }

    public void setBusinessGoal(String businessGoal) {
      this.businessGoal = businessGoal;
    }

    public String getBackgroundKnowledge() {
      return backgroundKnowledge;
    }

    public void setBackgroundKnowledge(String backgroundKnowledge) {
      this.backgroundKnowledge = backgroundKnowledge;
    }

    public String getDeliveryScope() {
      return deliveryScope;
    }

    public void setDeliveryScope(String deliveryScope) {
      this.deliveryScope = deliveryScope;
    }

    public Boolean getDataUpdateEnabled() {
      return dataUpdateEnabled;
    }

    public void setDataUpdateEnabled(Boolean dataUpdateEnabled) {
      this.dataUpdateEnabled = dataUpdateEnabled;
    }

    public String getDataUpdateMode() {
      return dataUpdateMode;
    }

    public void setDataUpdateMode(String dataUpdateMode) {
      this.dataUpdateMode = dataUpdateMode;
    }

    public Object getProcessingRuleDrafts() {
      return processingRuleDrafts;
    }

    public void setProcessingRuleDrafts(Object processingRuleDrafts) {
      this.processingRuleDrafts = processingRuleDrafts;
    }
  }

  public static class RequirementCreateRequest {
    private String title;
    private String phase;
    private String owner;
    private String assignee;
    private String businessGoal;
    private String backgroundKnowledge;
    private String deliveryScope;
    private Map<String, Object> collectionPolicy;
    private Boolean dataUpdateEnabled;
    private String dataUpdateMode;
    private WideTableCreateRequest wideTable;

    public String getTitle() {
      return title;
    }

    public void setTitle(String title) {
      this.title = title;
    }

    public String getPhase() {
      return phase;
    }

    public void setPhase(String phase) {
      this.phase = phase;
    }

    public String getOwner() {
      return owner;
    }

    public void setOwner(String owner) {
      this.owner = owner;
    }

    public String getAssignee() {
      return assignee;
    }

    public void setAssignee(String assignee) {
      this.assignee = assignee;
    }

    public String getBusinessGoal() {
      return businessGoal;
    }

    public void setBusinessGoal(String businessGoal) {
      this.businessGoal = businessGoal;
    }

    public String getBackgroundKnowledge() {
      return backgroundKnowledge;
    }

    public void setBackgroundKnowledge(String backgroundKnowledge) {
      this.backgroundKnowledge = backgroundKnowledge;
    }

    public String getDeliveryScope() {
      return deliveryScope;
    }

    public void setDeliveryScope(String deliveryScope) {
      this.deliveryScope = deliveryScope;
    }

    public Map<String, Object> getCollectionPolicy() {
      return collectionPolicy;
    }

    public void setCollectionPolicy(Map<String, Object> collectionPolicy) {
      this.collectionPolicy = collectionPolicy;
    }

    public Boolean getDataUpdateEnabled() {
      return dataUpdateEnabled;
    }

    public void setDataUpdateEnabled(Boolean dataUpdateEnabled) {
      this.dataUpdateEnabled = dataUpdateEnabled;
    }

    public String getDataUpdateMode() {
      return dataUpdateMode;
    }

    public void setDataUpdateMode(String dataUpdateMode) {
      this.dataUpdateMode = dataUpdateMode;
    }

    public WideTableCreateRequest getWideTable() {
      return wideTable;
    }

    public void setWideTable(WideTableCreateRequest wideTable) {
      this.wideTable = wideTable;
    }
  }

  public static class WideTableCreateRequest {
    private String title;
    private String description;
    private String tableName;
    private Integer schemaVersion;
    private Object schema;
    private Object scope;
    private Object indicatorGroups;
    private Object scheduleRules;
    private String semanticTimeAxis;
    private String collectionCoverageMode;
    private String status;

    public String getTitle() {
      return title;
    }

    public void setTitle(String title) {
      this.title = title;
    }

    public String getDescription() {
      return description;
    }

    public void setDescription(String description) {
      this.description = description;
    }

    public String getTableName() {
      return tableName;
    }

    public void setTableName(String tableName) {
      this.tableName = tableName;
    }

    public Integer getSchemaVersion() {
      return schemaVersion;
    }

    public void setSchemaVersion(Integer schemaVersion) {
      this.schemaVersion = schemaVersion;
    }

    public Object getSchema() {
      return schema;
    }

    public void setSchema(Object schema) {
      this.schema = schema;
    }

    public Object getScope() {
      return scope;
    }

    public void setScope(Object scope) {
      this.scope = scope;
    }

    public Object getIndicatorGroups() {
      return indicatorGroups;
    }

    public void setIndicatorGroups(Object indicatorGroups) {
      this.indicatorGroups = indicatorGroups;
    }

    public Object getScheduleRules() {
      return scheduleRules;
    }

    public void setScheduleRules(Object scheduleRules) {
      this.scheduleRules = scheduleRules;
    }

    public String getSemanticTimeAxis() {
      return semanticTimeAxis;
    }

    public void setSemanticTimeAxis(String semanticTimeAxis) {
      this.semanticTimeAxis = semanticTimeAxis;
    }

    public String getCollectionCoverageMode() {
      return collectionCoverageMode;
    }

    public void setCollectionCoverageMode(String collectionCoverageMode) {
      this.collectionCoverageMode = collectionCoverageMode;
    }

    public String getStatus() {
      return status;
    }

    public void setStatus(String status) {
      this.status = status;
    }
  }

  /** Requirement list item with embedded primary wide table (legacy frontend expects `wide_table`). */
  public static class RequirementWithWideTableResponse {
    private String id;
    private String projectId;
    private String title;
    private String phase;
    private String status;
    private Boolean schemaLocked;
    private String owner;
    private String assignee;
    private String businessGoal;
    private String backgroundKnowledge;
    private String businessBoundary;
    private String deliveryScope;
    private Map<String, Object> collectionPolicy;
    private Boolean dataUpdateEnabled;
    private String dataUpdateMode;
    private Object createdAt;
    private Object updatedAt;
    private WideTableResponse wideTable;

    public static RequirementWithWideTableResponse from(
        RequirementRecord record,
        WideTableRecord wideTableRecord,
        ObjectMapper objectMapper) {
      RequirementWithWideTableResponse out = new RequirementWithWideTableResponse();
      out.id = record.getId();
      out.projectId = record.getProjectId();
      out.title = record.getTitle();
      out.phase = record.getPhase();
      out.status = record.getStatus();
      out.schemaLocked = record.getSchemaLocked();
      out.owner = record.getOwner();
      out.assignee = record.getAssignee();
      out.businessGoal = record.getBusinessGoal();
      out.backgroundKnowledge = record.getBackgroundKnowledge();
      out.businessBoundary = record.getBusinessBoundary();
      out.deliveryScope = record.getDeliveryScope();
      out.collectionPolicy = RequirementResponse.parseJsonObject(record.getCollectionPolicy(), objectMapper);
      out.dataUpdateEnabled = record.getDataUpdateEnabled();
      out.dataUpdateMode = record.getDataUpdateMode();
      out.createdAt = record.getCreatedAt();
      out.updatedAt = record.getUpdatedAt();
      out.wideTable = WideTableResponse.from(wideTableRecord, objectMapper);
      return out;
    }

    public String getId() {
      return id;
    }

    public String getProjectId() {
      return projectId;
    }

    public String getTitle() {
      return title;
    }

    public String getPhase() {
      return phase;
    }

    public String getStatus() {
      return status;
    }

    public Boolean getSchemaLocked() {
      return schemaLocked;
    }

    public String getOwner() {
      return owner;
    }

    public String getAssignee() {
      return assignee;
    }

    public String getBusinessGoal() {
      return businessGoal;
    }

    public String getBackgroundKnowledge() {
      return backgroundKnowledge;
    }

    public String getBusinessBoundary() {
      return businessBoundary;
    }

    public String getDeliveryScope() {
      return deliveryScope;
    }

    public Map<String, Object> getCollectionPolicy() {
      return collectionPolicy;
    }

    public Boolean getDataUpdateEnabled() {
      return dataUpdateEnabled;
    }

    public String getDataUpdateMode() {
      return dataUpdateMode;
    }

    public Object getCreatedAt() {
      return createdAt;
    }

    public Object getUpdatedAt() {
      return updatedAt;
    }

    public WideTableResponse getWideTable() {
      return wideTable;
    }
  }

  public static class WideTableResponse {
    private String id;
    private String title;
    private String description;
    private Object schema;
    private Object scope;
    private Object indicatorGroups;
    private Object scheduleRules;
    private String semanticTimeAxis;
    private String collectionCoverageMode;
    private Integer schemaVersion;
    private Integer recordCount;
    private String status;
    private Object createdAt;
    private Object updatedAt;

    public static WideTableResponse from(WideTableRecord record, ObjectMapper objectMapper) {
      if (record == null) {
        return null;
      }
      WideTableResponse out = new WideTableResponse();
      out.id = record.getId();
      out.title = record.getTitle();
      out.description = record.getDescription();
      out.schema = parseJsonAny(record.getSchemaJson(), objectMapper);
      out.scope = parseJsonAny(record.getScopeJson(), objectMapper);
      out.indicatorGroups = parseJsonAny(record.getIndicatorGroupsJson(), objectMapper);
      out.scheduleRules = parseJsonAny(record.getScheduleRulesJson(), objectMapper);
      out.semanticTimeAxis = record.getSemanticTimeAxis();
      out.collectionCoverageMode = record.getCollectionCoverageMode();
      out.schemaVersion = record.getSchemaVersion();
      out.recordCount = record.getRecordCount();
      out.status = record.getStatus();
      out.createdAt = record.getCreatedAt();
      out.updatedAt = record.getUpdatedAt();
      return out;
    }

    private static Object parseJsonAny(String raw, ObjectMapper objectMapper) {
      if (raw == null || raw.trim().isEmpty()) {
        return null;
      }
      try {
        return objectMapper.readValue(raw, new TypeReference<Object>() {});
      } catch (Exception ex) {
        return null;
      }
    }

    public String getId() {
      return id;
    }

    public String getTitle() {
      return title;
    }

    public String getDescription() {
      return description;
    }

    public Object getSchema() {
      return schema;
    }

    public Object getScope() {
      return scope;
    }

    public Object getIndicatorGroups() {
      return indicatorGroups;
    }

    public Object getScheduleRules() {
      return scheduleRules;
    }

    public String getSemanticTimeAxis() {
      return semanticTimeAxis;
    }

    public String getCollectionCoverageMode() {
      return collectionCoverageMode;
    }

    public Integer getSchemaVersion() {
      return schemaVersion;
    }

    public Integer getRecordCount() {
      return recordCount;
    }

    public String getStatus() {
      return status;
    }

    public Object getCreatedAt() {
      return createdAt;
    }

    public Object getUpdatedAt() {
      return updatedAt;
    }
  }
}
