package com.huatai.datafoundry.backend.task.infrastructure.repository;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableReadRepository;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisWideTableReadRepository implements WideTableReadRepository {
  private final WideTableMapper wideTableMapper;

  public MybatisWideTableReadRepository(WideTableMapper wideTableMapper) {
    this.wideTableMapper = wideTableMapper;
  }

  @Override
  public WideTablePlanSource getPrimaryByRequirement(String requirementId) {
    WideTableRecord record = wideTableMapper.getPrimaryByRequirement(requirementId);
    return record != null ? toPlanSource(record) : null;
  }

  @Override
  public WideTablePlanSource getByIdForRequirement(String requirementId, String wideTableId) {
    WideTableRecord record = wideTableMapper.getByIdForRequirement(requirementId, wideTableId);
    return record != null ? toPlanSource(record) : null;
  }

  private static WideTablePlanSource toPlanSource(WideTableRecord record) {
    WideTablePlanSource src = new WideTablePlanSource();
    src.setId(record.getId());
    src.setRequirementId(record.getRequirementId());
    src.setSchemaVersion(record.getSchemaVersion());
    src.setSchemaJson(record.getSchemaJson());
    src.setScopeJson(record.getScopeJson());
    src.setIndicatorGroupsJson(record.getIndicatorGroupsJson());
    src.setScheduleRulesJson(record.getScheduleRulesJson());
    src.setSemanticTimeAxis(record.getSemanticTimeAxis());
    src.setCollectionCoverageMode(record.getCollectionCoverageMode());
    return src;
  }
}
