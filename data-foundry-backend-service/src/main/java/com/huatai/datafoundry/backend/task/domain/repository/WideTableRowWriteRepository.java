package com.huatai.datafoundry.backend.task.domain.repository;

import com.huatai.datafoundry.backend.task.domain.model.WideTableRowValuePatch;

public interface WideTableRowWriteRepository {
  String getIndicatorValuesJson(String wideTableId, Integer rowId);

  int updateIndicatorValues(WideTableRowValuePatch patch);
}
