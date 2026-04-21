package com.huatai.datafoundry.backend.requirement.infrastructure.repository;

import com.huatai.datafoundry.backend.requirement.domain.model.Requirement;
import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.RequirementMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.RequirementRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.requirement.domain.repository.RequirementRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisRequirementRepository implements RequirementRepository {
  private final RequirementMapper requirementMapper;
  private final WideTableMapper wideTableMapper;

  public MybatisRequirementRepository(RequirementMapper requirementMapper, WideTableMapper wideTableMapper) {
    this.requirementMapper = requirementMapper;
    this.wideTableMapper = wideTableMapper;
  }

  @Override
  public List<Requirement> listByProject(String projectId) {
    List<RequirementRecord> records = requirementMapper.listByProject(projectId);
    if (records == null) return new ArrayList<Requirement>();
    List<Requirement> out = new ArrayList<Requirement>(records.size());
    for (RequirementRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }

  @Override
  public Requirement getByProjectAndId(String projectId, String requirementId) {
    RequirementRecord record = requirementMapper.get(projectId, requirementId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public Requirement getById(String requirementId) {
    RequirementRecord record = requirementMapper.getById(requirementId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public int insertRequirement(Requirement requirement) {
    return requirementMapper.insert(toRecord(requirement));
  }

  @Override
  public int updateRequirementByProjectAndId(Requirement requirementPatch) {
    return requirementMapper.updateByProjectAndId(toRecord(requirementPatch));
  }

  @Override
  public WideTable getPrimaryWideTableByRequirement(String requirementId) {
    WideTableRecord record = wideTableMapper.getPrimaryByRequirement(requirementId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public List<WideTable> listPrimaryWideTablesByRequirementIds(List<String> requirementIds) {
    List<WideTableRecord> records = wideTableMapper.listPrimaryByRequirementIds(requirementIds);
    if (records == null) return new ArrayList<WideTable>();
    List<WideTable> out = new ArrayList<WideTable>(records.size());
    for (WideTableRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }

  @Override
  public WideTable getWideTableByIdForRequirement(String requirementId, String wideTableId) {
    WideTableRecord record = wideTableMapper.getByIdForRequirement(requirementId, wideTableId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public int insertWideTable(WideTable wideTable) {
    return wideTableMapper.insert(toRecord(wideTable));
  }

  @Override
  public int updateWideTableByIdAndRequirement(WideTable wideTablePatch) {
    return wideTableMapper.updateByIdAndRequirement(toRecord(wideTablePatch));
  }

  private static Requirement toDomain(RequirementRecord record) {
    Requirement r = new Requirement();
    r.setId(record.getId());
    r.setProjectId(record.getProjectId());
    r.setTitle(record.getTitle());
    r.setPhase(record.getPhase());
    r.setStatus(record.getStatus());
    r.setSchemaLocked(record.getSchemaLocked());
    r.setOwner(record.getOwner());
    r.setAssignee(record.getAssignee());
    r.setBusinessGoal(record.getBusinessGoal());
    r.setBackgroundKnowledge(record.getBackgroundKnowledge());
    r.setBusinessBoundary(record.getBusinessBoundary());
    r.setDeliveryScope(record.getDeliveryScope());
    r.setProcessingRuleDraftsJson(record.getProcessingRuleDrafts());
    r.setCollectionPolicyJson(record.getCollectionPolicy());
    r.setDataUpdateEnabled(record.getDataUpdateEnabled());
    r.setDataUpdateMode(record.getDataUpdateMode());
    r.setCreatedAt(record.getCreatedAt());
    r.setUpdatedAt(record.getUpdatedAt());
    return r;
  }

  private static RequirementRecord toRecord(Requirement requirement) {
    if (requirement == null) return null;
    RequirementRecord record = new RequirementRecord();
    record.setId(requirement.getId());
    record.setProjectId(requirement.getProjectId());
    record.setTitle(requirement.getTitle());
    record.setPhase(requirement.getPhase());
    record.setStatus(requirement.getStatus());
    record.setSchemaLocked(requirement.getSchemaLocked());
    record.setOwner(requirement.getOwner());
    record.setAssignee(requirement.getAssignee());
    record.setBusinessGoal(requirement.getBusinessGoal());
    record.setBackgroundKnowledge(requirement.getBackgroundKnowledge());
    record.setBusinessBoundary(requirement.getBusinessBoundary());
    record.setDeliveryScope(requirement.getDeliveryScope());
    record.setProcessingRuleDrafts(requirement.getProcessingRuleDraftsJson());
    record.setCollectionPolicy(requirement.getCollectionPolicyJson());
    record.setDataUpdateEnabled(requirement.getDataUpdateEnabled());
    record.setDataUpdateMode(requirement.getDataUpdateMode());
    return record;
  }

  private static WideTable toDomain(WideTableRecord record) {
    WideTable wt = new WideTable();
    wt.setId(record.getId());
    wt.setSortOrder(record.getSortOrder());
    wt.setRequirementId(record.getRequirementId());
    wt.setTitle(record.getTitle());
    wt.setDescription(record.getDescription());
    wt.setTableName(record.getTableName());
    wt.setSchemaVersion(record.getSchemaVersion());
    wt.setSchemaJson(record.getSchemaJson());
    wt.setScopeJson(record.getScopeJson());
    wt.setIndicatorGroupsJson(record.getIndicatorGroupsJson());
    wt.setScheduleRulesJson(record.getScheduleRulesJson());
    wt.setSemanticTimeAxis(record.getSemanticTimeAxis());
    wt.setCollectionCoverageMode(record.getCollectionCoverageMode());
    wt.setStatus(record.getStatus());
    wt.setRecordCount(record.getRecordCount());
    wt.setCreatedAt(record.getCreatedAt());
    wt.setUpdatedAt(record.getUpdatedAt());
    return wt;
  }

  private static WideTableRecord toRecord(WideTable wideTable) {
    if (wideTable == null) return null;
    WideTableRecord record = new WideTableRecord();
    record.setId(wideTable.getId());
    record.setSortOrder(wideTable.getSortOrder());
    record.setRequirementId(wideTable.getRequirementId());
    record.setTitle(wideTable.getTitle());
    record.setDescription(wideTable.getDescription());
    record.setTableName(wideTable.getTableName());
    record.setSchemaVersion(wideTable.getSchemaVersion());
    record.setSchemaJson(wideTable.getSchemaJson());
    record.setScopeJson(wideTable.getScopeJson());
    record.setIndicatorGroupsJson(wideTable.getIndicatorGroupsJson());
    record.setScheduleRulesJson(wideTable.getScheduleRulesJson());
    record.setSemanticTimeAxis(wideTable.getSemanticTimeAxis());
    record.setCollectionCoverageMode(wideTable.getCollectionCoverageMode());
    record.setStatus(wideTable.getStatus());
    record.setRecordCount(wideTable.getRecordCount());
    return record;
  }
}
