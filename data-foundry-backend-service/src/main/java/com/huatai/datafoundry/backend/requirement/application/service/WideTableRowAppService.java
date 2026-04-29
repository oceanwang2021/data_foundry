package com.huatai.datafoundry.backend.requirement.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WideTableRowAppService {
  private final WideTableRowMapper wideTableRowMapper;
  private final ObjectMapper objectMapper;

  public WideTableRowAppService(WideTableRowMapper wideTableRowMapper, ObjectMapper objectMapper) {
    this.wideTableRowMapper = wideTableRowMapper;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public void updateRow(String wideTableId, Integer rowId, Map<String, Object> body) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wideTableId is required");
    }
    if (rowId == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "rowId is required");
    }

    String rowStatus = body != null ? asString(body.get("row_status")) : null;
    Object indicatorValues = body != null ? body.get("indicator_values") : null;
    Object systemValues = body != null ? body.get("system_values") : null;

    WideTableRowRecord patch = new WideTableRowRecord();
    patch.setWideTableId(wideTableId);
    patch.setRowId(rowId);
    patch.setRowStatus(rowStatus);
    patch.setIndicatorValuesJson(indicatorValues != null ? writeJson(indicatorValues) : null);
    patch.setSystemValuesJson(systemValues != null ? writeJson(systemValues) : null);

    int updated = wideTableRowMapper.updateRowValues(patch);
    if (updated <= 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table row not found");
    }
  }

  private String asString(Object value) {
    if (value == null) return null;
    String s = String.valueOf(value);
    return s != null ? s.trim() : null;
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid JSON payload");
    }
  }
}

