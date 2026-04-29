package com.huatai.datafoundry.backend.requirement.application.query.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableScopeImportReadDto;
import com.huatai.datafoundry.backend.requirement.domain.model.Requirement;
import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import com.huatai.datafoundry.backend.requirement.domain.repository.RequirementRepository;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableScopeImportMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableScopeImportRecord;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RequirementQueryService {
  private final RequirementRepository requirementRepository;
  private final WideTableScopeImportMapper wideTableScopeImportMapper;
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final ObjectMapper objectMapper;

  public RequirementQueryService(
      RequirementRepository requirementRepository,
      WideTableScopeImportMapper wideTableScopeImportMapper,
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      ObjectMapper objectMapper) {
    this.requirementRepository = requirementRepository;
    this.wideTableScopeImportMapper = wideTableScopeImportMapper;
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.objectMapper = objectMapper;
  }

  public List<RequirementReadDto> listByProject(String projectId) {
    List<Requirement> requirements = requirementRepository.listByProject(projectId);
    if (requirements == null || requirements.isEmpty()) {
      return new ArrayList<RequirementReadDto>();
    }

    List<String> requirementIds = new ArrayList<String>(requirements.size());
    for (Requirement record : requirements) {
      if (record != null && record.getId() != null) {
        requirementIds.add(record.getId());
      }
    }

    Map<String, WideTable> primaryByRequirement = new HashMap<String, WideTable>();
    if (!requirementIds.isEmpty()) {
      List<WideTable> wideTables =
          requirementRepository.listPrimaryWideTablesByRequirementIds(requirementIds);
      if (wideTables != null) {
        for (WideTable wt : wideTables) {
          if (wt != null && wt.getRequirementId() != null) {
            primaryByRequirement.put(wt.getRequirementId(), wt);
          }
        }
      }
    }

    List<RequirementReadDto> out = new ArrayList<RequirementReadDto>(requirements.size());
    for (Requirement record : requirements) {
      if (record == null) continue;
      RequirementReadDto dto = mapRequirement(record);
      WideTable primary = primaryByRequirement.get(record.getId());
      if (primary != null) {
        dto.setWideTable(mapWideTable(primary));
      }
      out.add(dto);
    }
    return out;
  }

  public RequirementReadDto getByProjectAndId(String projectId, String requirementId) {
    Requirement record = requirementRepository.getByProjectAndId(projectId, requirementId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    return mapRequirement(record);
  }

  public WideTableReadDto getPrimaryWideTableByRequirement(String requirementId) {
    WideTable record = requirementRepository.getPrimaryWideTableByRequirement(requirementId);
    return record != null ? mapWideTable(record) : null;
  }

  public WideTableReadDto getWideTableByIdForRequirement(String requirementId, String wideTableId) {
    WideTable record = requirementRepository.getWideTableByIdForRequirement(requirementId, wideTableId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
    return mapWideTable(record);
  }

  public List<TaskGroupReadDto> listTaskGroups(String projectId, String requirementId) {
    assertRequirementExists(projectId, requirementId);
    List<TaskGroup> records = taskGroupRepository.listByRequirement(requirementId);
    List<TaskGroupReadDto> out = new ArrayList<TaskGroupReadDto>();
    if (records == null) return out;
    for (TaskGroup record : records) {
      if (record == null) continue;
      TaskGroupReadDto dto = new TaskGroupReadDto();
      dto.setId(record.getId());
      dto.setSortOrder(record.getSortOrder());
      dto.setRequirementId(record.getRequirementId());
      dto.setWideTableId(record.getWideTableId());
      dto.setBatchId(record.getBatchId());
      dto.setBusinessDate(record.getBusinessDate());
      dto.setSourceType(record.getSourceType());
      dto.setStatus(record.getStatus());
      dto.setScheduleRuleId(record.getScheduleRuleId());
      dto.setBackfillRequestId(record.getBackfillRequestId());
      dto.setPlanVersion(record.getPlanVersion());
      dto.setGroupKind(record.getGroupKind());
      dto.setPartitionType(record.getPartitionType());
      dto.setPartitionKey(record.getPartitionKey());
      dto.setPartitionLabel(record.getPartitionLabel());
      dto.setTotalTasks(record.getTotalTasks());
      dto.setCompletedTasks(record.getCompletedTasks());
      dto.setFailedTasks(record.getFailedTasks());
      dto.setTriggeredBy(record.getTriggeredBy());
      dto.setCreatedAt(record.getCreatedAt());
      dto.setUpdatedAt(record.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  public List<FetchTaskReadDto> listFetchTasks(String projectId, String requirementId) {
    assertRequirementExists(projectId, requirementId);
    List<FetchTask> records = fetchTaskRepository.listByRequirement(requirementId);
    List<FetchTaskReadDto> out = new ArrayList<FetchTaskReadDto>();
    if (records == null) return out;
    for (FetchTask record : records) {
      if (record == null) continue;
      FetchTaskReadDto dto = new FetchTaskReadDto();
      dto.setId(record.getId());
      dto.setSortOrder(record.getSortOrder());
      dto.setRequirementId(record.getRequirementId());
      dto.setWideTableId(record.getWideTableId());
      dto.setTaskGroupId(record.getTaskGroupId());
      dto.setBatchId(record.getBatchId());
      dto.setRowId(record.getRowId());
      dto.setIndicatorGroupId(record.getIndicatorGroupId());
      dto.setIndicatorGroupName(record.getIndicatorGroupName());
      dto.setName(record.getName());
      dto.setSchemaVersion(record.getSchemaVersion());
      dto.setExecutionMode(record.getExecutionMode());
      dto.setIndicatorKeysJson(record.getIndicatorKeysJson());
      dto.setDimensionValuesJson(record.getDimensionValuesJson());
      dto.setBusinessDate(record.getBusinessDate());
      dto.setStatus(record.getStatus());
      dto.setCanRerun(record.getCanRerun());
      dto.setInvalidatedReason(record.getInvalidatedReason());
      dto.setOwner(record.getOwner());
      dto.setConfidence(record.getConfidence());
      dto.setPlanVersion(record.getPlanVersion());
      dto.setRowBindingKey(record.getRowBindingKey());
      dto.setCreatedAt(record.getCreatedAt());
      dto.setUpdatedAt(record.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  private void assertRequirementExists(String projectId, String requirementId) {
    Requirement record = requirementRepository.getByProjectAndId(projectId, requirementId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
  }

  private RequirementReadDto mapRequirement(Requirement record) {
    RequirementReadDto dto = new RequirementReadDto();
    dto.setId(record.getId());
    dto.setProjectId(record.getProjectId());
    dto.setTitle(record.getTitle());
    dto.setPhase(record.getPhase());
    dto.setStatus(record.getStatus());
    dto.setSchemaLocked(record.getSchemaLocked());
    dto.setOwner(record.getOwner());
    dto.setAssignee(record.getAssignee());
    dto.setBusinessGoal(record.getBusinessGoal());
    dto.setBackgroundKnowledge(record.getBackgroundKnowledge());
    dto.setBusinessBoundary(record.getBusinessBoundary());
    dto.setDeliveryScope(record.getDeliveryScope());
    dto.setCollectionPolicy(parseJsonObject(record.getCollectionPolicyJson()));
    dto.setDataUpdateEnabled(record.getDataUpdateEnabled());
    dto.setDataUpdateMode(record.getDataUpdateMode());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private WideTableReadDto mapWideTable(WideTable record) {
    WideTableReadDto dto = new WideTableReadDto();
    dto.setId(record.getId());
    dto.setTitle(record.getTitle());
    dto.setDescription(record.getDescription());
    dto.setTableName(record.getTableName());
    dto.setSchema(parseJsonAny(record.getSchemaJson()));
    dto.setScope(parseJsonAny(record.getScopeJson()));
    dto.setScopeImport(mapScopeImport(wideTableScopeImportMapper.getByWideTableId(record.getId())));
    dto.setIndicatorGroups(parseJsonAny(record.getIndicatorGroupsJson()));
    dto.setScheduleRules(parseJsonAny(record.getScheduleRulesJson()));
    dto.setSemanticTimeAxis(record.getSemanticTimeAxis());
    dto.setCollectionCoverageMode(record.getCollectionCoverageMode());
    dto.setSchemaVersion(record.getSchemaVersion());
    dto.setRecordCount(record.getRecordCount());
    dto.setStatus(record.getStatus());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private WideTableScopeImportReadDto mapScopeImport(WideTableScopeImportRecord record) {
    if (record == null) {
      return null;
    }
    WideTableScopeImportReadDto dto = new WideTableScopeImportReadDto();
    dto.setFileName(record.getFileName());
    dto.setFileType(record.getFileType());
    dto.setRowCount(record.getRowCount());
    dto.setImportMode(record.getImportMode());
    dto.setContentHash(record.getContentHash());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private Map<String, Object> parseJsonObject(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
    } catch (Exception ex) {
      return null;
    }
  }

  private Object parseJsonAny(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<Object>() {});
    } catch (Exception ex) {
      return null;
    }
  }
}
