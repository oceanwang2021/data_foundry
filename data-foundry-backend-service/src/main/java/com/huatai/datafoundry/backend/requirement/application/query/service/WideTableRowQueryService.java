package com.huatai.datafoundry.backend.requirement.application.query.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableRowReadDto;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class WideTableRowQueryService {
  private final WideTableRowMapper wideTableRowMapper;
  private final ObjectMapper objectMapper;

  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};

  public WideTableRowQueryService(WideTableRowMapper wideTableRowMapper, ObjectMapper objectMapper) {
    this.wideTableRowMapper = wideTableRowMapper;
    this.objectMapper = objectMapper;
  }

  public List<WideTableRowReadDto> listByWideTableId(String wideTableId) {
    List<WideTableRowRecord> records = wideTableRowMapper.listByWideTableId(wideTableId);
    List<WideTableRowReadDto> out = new ArrayList<WideTableRowReadDto>();
    if (records == null) return out;
    for (WideTableRowRecord record : records) {
      if (record == null) continue;
      out.add(map(record));
    }
    return out;
  }

  private WideTableRowReadDto map(WideTableRowRecord record) {
    WideTableRowReadDto dto = new WideTableRowReadDto();
    dto.setWideTableId(record.getWideTableId());
    dto.setRowId(record.getRowId());
    dto.setPlanVersion(record.getPlanVersion());
    dto.setRowStatus(record.getRowStatus());
    dto.setBusinessDate(record.getBusinessDate());
    dto.setRowBindingKey(record.getRowBindingKey());
    dto.setDimensionValues(readJsonMap(record.getDimensionValuesJson()));
    dto.setIndicatorValues(readJsonMap(record.getIndicatorValuesJson()));
    dto.setSystemValues(readJsonMap(record.getSystemValuesJson()));
    return dto;
  }

  private Map<String, Object> readJsonMap(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(raw, MAP_REF);
    } catch (Exception e) {
      return null;
    }
  }
}

