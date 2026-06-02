package com.huatai.datafoundry.backend.requirement.application.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WideTableRowAppService {
  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};

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
    WideTableRowRecord existing = wideTableRowMapper.getById(wideTableId, rowId);
    if (existing == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table row not found");
    }

    WideTableRowRecord patch = new WideTableRowRecord();
    patch.setWideTableId(wideTableId);
    patch.setRowId(rowId);
    patch.setRowStatus(rowStatus);
    patch.setIndicatorValuesJson(
        indicatorValues != null
            ? writeJson(mergeObject(existing.getIndicatorValuesJson(), indicatorValues, "indicator_values"))
            : null);
    patch.setSystemValuesJson(
        systemValues != null
            ? writeJson(mergeObject(existing.getSystemValuesJson(), systemValues, "system_values"))
            : null);

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

  private Map<String, Object> mergeObject(String currentJson, Object patchValue, String fieldName) {
    Map<String, Object> out = readJsonObject(currentJson);
    out.putAll(readObject(patchValue, fieldName));
    return out;
  }

  private Map<String, Object> readJsonObject(String json) {
    if (json == null || json.trim().isEmpty()) {
      return new LinkedHashMap<String, Object>();
    }
    try {
      Map<String, Object> parsed = objectMapper.readValue(json, MAP_REF);
      return parsed != null ? new LinkedHashMap<String, Object>(parsed) : new LinkedHashMap<String, Object>();
    } catch (Exception e) {
      return new LinkedHashMap<String, Object>();
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> readObject(Object value, String fieldName) {
    if (value instanceof Map<?, ?>) {
      return new LinkedHashMap<String, Object>((Map<String, Object>) value);
    }
    if (value instanceof String) {
      try {
        Map<String, Object> parsed = objectMapper.readValue((String) value, MAP_REF);
        return parsed != null ? new LinkedHashMap<String, Object>(parsed) : new LinkedHashMap<String, Object>();
      } catch (Exception e) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid JSON payload: " + fieldName);
      }
    }
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " must be an object");
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid JSON payload");
    }
  }
}

