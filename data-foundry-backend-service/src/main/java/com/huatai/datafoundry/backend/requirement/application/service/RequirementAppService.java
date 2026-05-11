package com.huatai.datafoundry.backend.requirement.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.application.command.RequirementCreateCommand;
import com.huatai.datafoundry.backend.requirement.application.command.RequirementUpdateCommand;
import com.huatai.datafoundry.backend.requirement.application.command.WideTableCreateCommand;
import com.huatai.datafoundry.backend.requirement.application.command.WideTableUpdateCommand;
import com.huatai.datafoundry.backend.requirement.application.event.RequirementSubmittedEvent;
import com.huatai.datafoundry.backend.requirement.domain.model.Requirement;
import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import com.huatai.datafoundry.backend.requirement.domain.repository.RequirementRepository;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableScopeImportMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableScopeImportRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import com.huatai.datafoundry.backend.task.application.service.TaskPlanAppService;
import java.util.ArrayList;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map.Entry;
import java.util.Map;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RequirementAppService {
  private final RequirementRepository requirementRepository;
  private final WideTableScopeImportMapper wideTableScopeImportMapper;
  private final WideTableRowMapper wideTableRowMapper;
  private final ObjectMapper objectMapper;
  private final ApplicationEventPublisher eventPublisher;
  private final TaskPlanAppService taskPlanAppService;

  public RequirementAppService(
      RequirementRepository requirementRepository,
      WideTableScopeImportMapper wideTableScopeImportMapper,
      WideTableRowMapper wideTableRowMapper,
      ObjectMapper objectMapper,
      ApplicationEventPublisher eventPublisher,
      TaskPlanAppService taskPlanAppService) {
    this.requirementRepository = requirementRepository;
    this.wideTableScopeImportMapper = wideTableScopeImportMapper;
    this.wideTableRowMapper = wideTableRowMapper;
    this.objectMapper = objectMapper;
    this.eventPublisher = eventPublisher;
    this.taskPlanAppService = taskPlanAppService;
  }

  @Transactional
  public void createRequirement(
      String projectId, String requirementId, String wideTableId, RequirementCreateCommand command) {
    if (command == null || command.getTitle() == null || command.getTitle().trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requirement title is required");
    }

    Requirement record = new Requirement();
    record.setId(requirementId);
    record.setProjectId(projectId);
    record.setTitle(command.getTitle().trim());
    record.setPhase(command.getPhase() != null ? command.getPhase() : "production");
    record.setStatus("draft");
    record.setSchemaLocked(Boolean.FALSE);
    record.setOwner(command.getOwner());
    record.setAssignee(command.getAssignee());
    record.setBusinessGoal(command.getBusinessGoal());
    record.setBackgroundKnowledge(command.getBackgroundKnowledge());
    record.setDeliveryScope(command.getDeliveryScope());
    record.setDataUpdateEnabled(command.getDataUpdateEnabled());
    record.setDataUpdateMode(command.getDataUpdateMode());
    record.setCollectionPolicyJson(writeJson(command.getCollectionPolicy()));

    WideTable wideTableBase = toWideTableBase(command.getWideTable());
    WideTable primaryWideTable =
        buildPrimaryWideTableRecord(requirementId, record.getTitle(), wideTableId, wideTableBase);
    ensurePrimaryWideTableDefaults(primaryWideTable);

    requirementRepository.insertRequirement(record);
    requirementRepository.insertWideTable(primaryWideTable);
  }

  @Transactional
  public void updateByProjectAndId(
      String projectId, String requirementId, RequirementUpdateCommand command) {
    Requirement existing = requirementRepository.getByProjectAndId(projectId, requirementId);
    if (existing == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    if (Boolean.TRUE.equals(existing.getSchemaLocked()) && command != null && command.hasDefinitionEdits()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Requirement schema is locked");
    }

    // Submit semantics: moving to "ready" locks schema (no more edits).
    Requirement toUpdate = new Requirement();
    toUpdate.setId(requirementId);
    toUpdate.setProjectId(projectId);
    if (command != null) {
      toUpdate.setTitle(command.getTitle());
      toUpdate.setStatus(command.getStatus());
      toUpdate.setOwner(command.getOwner());
      toUpdate.setAssignee(command.getAssignee());
      toUpdate.setBusinessGoal(command.getBusinessGoal());
      toUpdate.setBackgroundKnowledge(command.getBackgroundKnowledge());
      toUpdate.setDeliveryScope(command.getDeliveryScope());
      toUpdate.setDataUpdateEnabled(command.getDataUpdateEnabled());
      toUpdate.setDataUpdateMode(command.getDataUpdateMode());
      if (command.getCollectionPolicy() != null) {
        toUpdate.setCollectionPolicyJson(writeJson(command.getCollectionPolicy()));
      }
      if (command.getProcessingRuleDrafts() != null) {
        toUpdate.setProcessingRuleDraftsJson(writeJson(command.getProcessingRuleDrafts()));
      }
      if ("ready".equalsIgnoreCase(command.getStatus())) {
        toUpdate.setSchemaLocked(true);
      }
    }
    int updated = requirementRepository.updateRequirementByProjectAndId(toUpdate);
    if (updated <= 0) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update requirement");
    }

    if (command != null && "ready".equalsIgnoreCase(command.getStatus())) {
      // Publish AFTER_COMMIT event (handled by RequirementSubmittedHandler).
      eventPublisher.publishEvent(new RequirementSubmittedEvent(requirementId));
    }
  }

  @Transactional
  public void updateWideTableForRequirement(
      String requirementId, String wideTableId, WideTableUpdateCommand command) {
    Requirement requirement = requirementRepository.getById(requirementId);
    if (requirement == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    if (Boolean.TRUE.equals(requirement.getSchemaLocked())) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Requirement schema is locked");
    }
    WideTable existing = requirementRepository.getWideTableByIdForRequirement(requirementId, wideTableId);
    if (existing == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }

    WideTable toUpdate = new WideTable();
    toUpdate.setId(existing.getId());
    toUpdate.setRequirementId(existing.getRequirementId());
    if (command != null) {
      toUpdate.setTitle(command.getTitle());
      toUpdate.setDescription(command.getDescription());
      toUpdate.setTableName(command.getTableName());
      toUpdate.setSemanticTimeAxis(command.getSemanticTimeAxis());
      toUpdate.setCollectionCoverageMode(command.getCollectionCoverageMode());

      toUpdate.setSchemaJson(writeJson(command.getSchema()));
      toUpdate.setScopeJson(writeJson(command.getScope()));
      toUpdate.setIndicatorGroupsJson(writeJson(command.getIndicatorGroups()));
      toUpdate.setScheduleRulesJson(writeJson(command.getScheduleRules()));

      Integer schemaVersion = command.inferSchemaVersion();
      if (schemaVersion != null) {
        toUpdate.setSchemaVersion(schemaVersion);
      }
    }

    int updated = requirementRepository.updateWideTableByIdAndRequirement(toUpdate);
    if (updated <= 0) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update wide table");
    }
  }

  public String writeJson(Object value) {
    if (value == null) return null;
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return null;
    }
  }

  public static String buildRequirementId() {
    int year = LocalDate.now().getYear();
    String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    return String.format("REQ-%d-%s", year, token);
  }

  public static WideTable buildPrimaryWideTableRecord(
      String requirementId, String requirementTitle, String wideTableId, WideTable base) {
    WideTable record = new WideTable();
    record.setId(wideTableId);
    record.setSortOrder(0);
    record.setRequirementId(requirementId);
    record.setTitle(requirementTitle != null ? requirementTitle : "宽表");
    record.setDescription(base != null ? base.getDescription() : null);
    record.setTableName(base != null && base.getTableName() != null ? base.getTableName() : "wide_table_" + requirementId);
    record.setSchemaVersion(base != null && base.getSchemaVersion() != null ? base.getSchemaVersion() : 1);
    record.setSchemaJson(base != null ? base.getSchemaJson() : null);
    record.setScopeJson(base != null ? base.getScopeJson() : null);
    record.setIndicatorGroupsJson(base != null ? base.getIndicatorGroupsJson() : "[]");
    record.setScheduleRulesJson(base != null ? base.getScheduleRulesJson() : "[]");
    record.setSemanticTimeAxis(base != null ? base.getSemanticTimeAxis() : null);
    record.setCollectionCoverageMode(base != null ? base.getCollectionCoverageMode() : null);
    record.setStatus(base != null && base.getStatus() != null ? base.getStatus() : "active");
    record.setRecordCount(base != null && base.getRecordCount() != null ? base.getRecordCount() : 0);
    return record;
  }

  private WideTable toWideTableBase(WideTableCreateCommand command) {
    if (command == null) {
      return null;
    }
    WideTable base = new WideTable();
    base.setTitle(command.getTitle());
    base.setDescription(command.getDescription());
    base.setTableName(command.getTableName());
    base.setSchemaVersion(command.getSchemaVersion());
    base.setSemanticTimeAxis(command.getSemanticTimeAxis());
    base.setCollectionCoverageMode(command.getCollectionCoverageMode());
    base.setStatus(command.getStatus());

    base.setSchemaJson(writeJson(command.getSchema()));
    base.setScopeJson(writeJson(command.getScope()));
    base.setIndicatorGroupsJson(writeJson(command.getIndicatorGroups()));
    base.setScheduleRulesJson(writeJson(command.getScheduleRules()));
    return base;
  }

  private void ensurePrimaryWideTableDefaults(WideTable record) {
    if (record == null) return;
    if (record.getIndicatorGroupsJson() == null) {
      record.setIndicatorGroupsJson("[]");
    }
    if (record.getScheduleRulesJson() == null) {
      record.setScheduleRulesJson("[]");
    }
  }

  @Transactional
  public Map<String, Object> persistWideTablePreview(
      String requirementId, String wideTableId, Map<String, Object> body) {
    WideTable wideTable = assertWideTableExists(requirementId, wideTableId);

    boolean rowsProvided = body != null && body.containsKey("rows") && body.get("rows") instanceof List;
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows =
        rowsProvided
            ? (List<Map<String, Object>>) body.get("rows")
            : null;
    boolean scopeImportProvided = body != null && body.containsKey("scope_import");
    @SuppressWarnings("unchecked")
    Map<String, Object> scopeImport =
        scopeImportProvided && body.get("scope_import") instanceof Map
            ? (Map<String, Object>) body.get("scope_import")
            : null;

    if (rowsProvided && (rows == null || rows.isEmpty())) {
      wideTableRowMapper.deleteByWideTableId(wideTableId);

      WideTable wtPatch = new WideTable();
      wtPatch.setId(wideTableId);
      wtPatch.setRequirementId(requirementId);
      wtPatch.setRecordCount(0);
      requirementRepository.updateWideTableByIdAndRequirement(wtPatch);
    } else if (rows != null && !rows.isEmpty()) {
      Integer schemaVersion = wideTable.getSchemaVersion() != null ? wideTable.getSchemaVersion() : 1;
      int inferredPlanVersion = 0;
      for (Map<String, Object> row : rows) {
        if (row == null) continue;
        inferredPlanVersion = Math.max(inferredPlanVersion, asInt(row.get("plan_version"), 0));
      }
      Integer planVersion = inferredPlanVersion > 0 ? inferredPlanVersion : 1;

      List<WideTableRowRecord> toUpsert = new ArrayList<WideTableRowRecord>(rows.size());
      int sortOrder = 0;
      for (Map<String, Object> row : rows) {
        if (row == null) continue;
        Integer rowId = asIntObj(row.get("row_id"));
        if (rowId == null) continue;

        Object parameterValues = row.get("parameter_values");
        Object dimensionValues = row.get("dimension_values");
        if (dimensionValues == null) {
          dimensionValues = parameterValues;
        }
        String dimensionValuesJson = dimensionValues != null ? writeJson(dimensionValues) : null;
        String businessDate = asString(row.get("business_date"));
        String rowStatus = asString(row.get("row_status"));
        if (rowStatus == null || rowStatus.isEmpty()) {
          rowStatus = "initialized";
        }
        String rowBindingKey = asString(row.get("row_binding_key"));
        if ((rowBindingKey == null || rowBindingKey.isEmpty()) && dimensionValues instanceof Map) {
          @SuppressWarnings("unchecked")
          Map<String, Object> dimMap = (Map<String, Object>) dimensionValues;
          rowBindingKey = buildRowBindingKey(businessDate, dimMap);
        }

        WideTableRowRecord record = new WideTableRowRecord();
        record.setWideTableId(wideTableId);
        record.setRowId(rowId);
        record.setSortOrder(++sortOrder);
        record.setRequirementId(requirementId);
        record.setSchemaVersion(schemaVersion);
        record.setPlanVersion(planVersion);
        record.setRowStatus(rowStatus);
        record.setDimensionValuesJson(dimensionValuesJson);
        record.setBusinessDate(businessDate);
        record.setRowBindingKey(rowBindingKey);
        toUpsert.add(record);
      }

      if (!toUpsert.isEmpty()) {
        wideTableRowMapper.upsertRows(toUpsert);
        wideTableRowMapper.deleteByWideTableIdNotPlanVersion(wideTableId, planVersion);

        WideTable wtPatch = new WideTable();
        wtPatch.setId(wideTableId);
        wtPatch.setRequirementId(requirementId);
        wtPatch.setRecordCount(toUpsert.size());
        if (wideTable.getStatus() == null || "draft".equalsIgnoreCase(wideTable.getStatus())) {
          wtPatch.setStatus("initialized");
        }
        requirementRepository.updateWideTableByIdAndRequirement(wtPatch);
      }
    }

    if (scopeImportProvided) {
      if (scopeImport == null || scopeImport.isEmpty()) {
        wideTableScopeImportMapper.deleteByWideTableId(wideTableId);
      } else {
        WideTableScopeImportRecord scopeImportRecord = new WideTableScopeImportRecord();
        scopeImportRecord.setWideTableId(wideTableId);
        scopeImportRecord.setRequirementId(requirementId);
        scopeImportRecord.setImportMode(asString(scopeImport.get("import_mode")));
        scopeImportRecord.setFileName(asString(scopeImport.get("file_name")));
        scopeImportRecord.setFileType(asString(scopeImport.get("file_type")));
        scopeImportRecord.setRowCount(asIntObj(scopeImport.get("row_count")));
        Object header = scopeImport.get("header");
        scopeImportRecord.setHeaderJson(header != null ? writeJson(header) : null);
        String fileContent = scopeImport.get("file_content") != null
            ? String.valueOf(scopeImport.get("file_content"))
            : null;
        scopeImportRecord.setFileContent(fileContent);
        scopeImportRecord.setContentHash(sha256Hex(fileContent));
        scopeImportRecord.setCreatedBy(asString(scopeImport.get("created_by")));
        wideTableScopeImportMapper.upsert(scopeImportRecord);
      }
    }

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  @Transactional
  public Map<String, Object> persistWideTablePlan(
      String requirementId, String wideTableId, Map<String, Object> body) {
    assertWideTableExists(requirementId, wideTableId);
    boolean invalidateMissing = false;
    if (body != null) {
      Object flag = body.get("invalidate_missing");
      invalidateMissing = isTruthy(flag);
    }
    if (body != null) {
      Object taskGroupsObj = body.get("task_groups");
      if (taskGroupsObj instanceof List) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> taskGroups = (List<Map<String, Object>>) taskGroupsObj;
        taskPlanAppService.persistPlanTaskGroups(requirementId, wideTableId, taskGroups, invalidateMissing);
      }
    }
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  private boolean isTruthy(Object value) {
    if (value instanceof Boolean) {
      return ((Boolean) value).booleanValue();
    }
    if (value instanceof Number) {
      return ((Number) value).intValue() != 0;
    }
    if (value == null) {
      return false;
    }
    String s = String.valueOf(value).trim();
    return "true".equalsIgnoreCase(s) || "1".equals(s) || "yes".equalsIgnoreCase(s);
  }

  public WideTable assertWideTableExists(String requirementId, String wideTableId) {
    Requirement requirement = requirementRepository.getById(requirementId);
    if (requirement == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    WideTable wideTable = requirementRepository.getWideTableByIdForRequirement(requirementId, wideTableId);
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
    return wideTable;
  }

  private Integer asIntObj(Object value) {
    if (value instanceof Number) {
      return ((Number) value).intValue();
    }
    if (value == null) return null;
    try {
      String s = String.valueOf(value).trim();
      if (s.isEmpty()) return null;
      return Integer.valueOf(s);
    } catch (Exception e) {
      return null;
    }
  }

  private String sha256Hex(String value) {
    if (value == null || value.isEmpty()) {
      return null;
    }
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder builder = new StringBuilder(bytes.length * 2);
      for (byte item : bytes) {
        builder.append(String.format("%02x", item));
      }
      return builder.toString();
    } catch (Exception ex) {
      return null;
    }
  }

  private int asInt(Object value, int fallback) {
    Integer parsed = asIntObj(value);
    return parsed != null ? parsed.intValue() : fallback;
  }

  private String asString(Object value) {
    if (value == null) return null;
    String s = String.valueOf(value);
    return s != null ? s.trim() : null;
  }

  private String buildRowBindingKey(String businessDate, Map<String, Object> dimensionValues) {
    StringBuilder sb = new StringBuilder();
    if (businessDate != null && !businessDate.isEmpty()) {
      sb.append("business_date:").append(businessDate);
    }
    if (dimensionValues != null) {
      for (Entry<String, Object> entry : dimensionValues.entrySet()) {
        if (entry == null) continue;
        String key = entry.getKey();
        if (key == null || key.trim().isEmpty()) continue;
        if (sb.length() > 0) sb.append("|");
        sb.append(key).append(":").append(entry.getValue() == null ? "" : String.valueOf(entry.getValue()));
      }
    }
    return sb.length() > 0 ? sb.toString() : "__singleton__";
  }
}
