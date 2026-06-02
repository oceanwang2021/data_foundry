package com.huatai.datafoundry.backend.requirement.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

public class WideTableRowAppServiceTest {

  @Test
  void updateRowMergesIndicatorAndSystemValuesInsteadOfReplacingWholeJson() throws Exception {
    WideTableRowMapper mapper = mock(WideTableRowMapper.class);
    ObjectMapper objectMapper = new ObjectMapper();
    WideTableRowAppService service = new WideTableRowAppService(mapper, objectMapper);

    WideTableRowRecord existing = new WideTableRowRecord();
    existing.setWideTableId("WT1");
    existing.setRowId(Integer.valueOf(1));
    existing.setIndicatorValuesJson(
        "{\"INFOCARAMOUNT\":{\"value\":100},\"INFOMILE\":{\"value\":804.67}}");
    existing.setSystemValuesJson("{\"last_task_id\":\"FT1\"}");

    when(mapper.getById("WT1", Integer.valueOf(1))).thenReturn(existing);
    when(mapper.updateRowValues(org.mockito.ArgumentMatchers.any(WideTableRowRecord.class)))
        .thenReturn(1);

    Map<String, Object> indicatorCell = new LinkedHashMap<String, Object>();
    indicatorCell.put("value", Integer.valueOf(200));
    indicatorCell.put("data_source", "acceptance-manual");

    Map<String, Object> indicatorValues = new LinkedHashMap<String, Object>();
    indicatorValues.put("INFOCARAMOUNT", indicatorCell);

    Map<String, Object> systemValues = new LinkedHashMap<String, Object>();
    systemValues.put("updated_at", "2026-06-02T12:00:00");

    Map<String, Object> body = new LinkedHashMap<String, Object>();
    body.put("indicator_values", indicatorValues);
    body.put("system_values", systemValues);

    service.updateRow("WT1", Integer.valueOf(1), body);

    ArgumentCaptor<WideTableRowRecord> captor = ArgumentCaptor.forClass(WideTableRowRecord.class);
    verify(mapper).updateRowValues(captor.capture());
    WideTableRowRecord patch = captor.getValue();

    Map<String, Object> mergedIndicators =
        objectMapper.readValue(patch.getIndicatorValuesJson(), new TypeReference<Map<String, Object>>() {});
    Map<String, Object> mergedSystems =
        objectMapper.readValue(patch.getSystemValuesJson(), new TypeReference<Map<String, Object>>() {});

    assertEquals(2, mergedIndicators.size());
    assertEquals("acceptance-manual",
        ((Map<?, ?>) mergedIndicators.get("INFOCARAMOUNT")).get("data_source"));
    assertEquals(Double.valueOf(804.67),
        ((Map<?, ?>) mergedIndicators.get("INFOMILE")).get("value"));
    assertEquals("FT1", mergedSystems.get("last_task_id"));
    assertEquals("2026-06-02T12:00:00", mergedSystems.get("updated_at"));
  }
}
