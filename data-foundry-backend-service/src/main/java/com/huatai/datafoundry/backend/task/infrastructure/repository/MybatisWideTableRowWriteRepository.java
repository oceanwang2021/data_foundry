package com.huatai.datafoundry.backend.task.infrastructure.repository;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import com.huatai.datafoundry.backend.task.domain.model.WideTableRowValuePatch;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisWideTableRowWriteRepository implements WideTableRowWriteRepository {
  private final WideTableRowMapper wideTableRowMapper;

  public MybatisWideTableRowWriteRepository(WideTableRowMapper wideTableRowMapper) {
    this.wideTableRowMapper = wideTableRowMapper;
  }

  @Override
  public String getIndicatorValuesJson(String wideTableId, Integer rowId) {
    WideTableRowRecord record = wideTableRowMapper.getById(wideTableId, rowId);
    return record != null ? record.getIndicatorValuesJson() : null;
  }

  @Override
  public int updateIndicatorValues(WideTableRowValuePatch patch) {
    WideTableRowRecord record = new WideTableRowRecord();
    record.setWideTableId(patch.getWideTableId());
    record.setRowId(patch.getRowId());
    record.setIndicatorValuesJson(patch.getIndicatorValuesJson());
    record.setRowStatus(patch.getRowStatus());
    return wideTableRowMapper.updateRowValues(record);
  }
}
