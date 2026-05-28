package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import com.huatai.datafoundry.backend.task.domain.model.WideTableRowValuePatch;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.MetricFieldMappingMapper;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

public class MappedResultMaterializationAppServiceTest {

  @Test
  void materializationWritesTaskDimensionsAndCanonicalMetricFields() throws Exception {
    CollectionResultRepository resultRepository = mock(CollectionResultRepository.class);
    MetricFieldMappingMapper mappingMapper = mock(MetricFieldMappingMapper.class);
    WideTableRowWriteRepository rowWriteRepository = mock(WideTableRowWriteRepository.class);
    ObjectMapper objectMapper = new ObjectMapper();

    MetricFieldMapping mapping = new MetricFieldMapping();
    mapping.setWideTableId("WT1");
    mapping.setSourceMetricName("\u8f66\u961f\u6570\u91cf");
    mapping.setTargetIndicatorKey("INFOCARAMOUNT");
    mapping.setTargetIndicatorName("\u8f66\u961f\u6570\u91cf");
    mapping.setStatus("confirmed");

    CollectionResult result = new CollectionResult();
    result.setId("CR1");
    result.setFetchTaskId("FT1");
    result.setScheduleJobId("SJ1");
    result.setWideTableId("WT1");
    result.setRowId(null);
    result.setNormalizedRowsJson(
        "[{"
            + "\"ROBOTYPE\":\"Robotaxi\","
            + "\"business_date\":\"2026-05-31\","
            + "\"\u6307\u6807\u540d\u79f0 (Metric Name)\":\"\u8f66\u961f\u6570\u91cf\","
            + "\"\u6307\u6807\u503c (Value)\":\"300\","
            + "\"\u5355\u4f4d (Unit)\":\"\u8f86\","
            + "\"\u6570\u636e\u65f6\u95f4 (Data Period)\":\"2026-05\","
            + "\"\u6570\u636e\u6765\u6e90 (Data Source)\":\"report\","
            + "\"\u903b\u8f91\u8bf4\u660e\u53ca\u8865\u5145 (Notes)\":\"note\","
            + "\"Min_Value\":\"280\","
            + "\"Max_Value\":\"300\","
            + "\"Source_URL\":\"https://example.com\","
            + "\"Source_Evidence\":\"evidence\","
            + "\"row_id\":\"3\","
            + "\"fetch_task_id\":\"FT1\","
            + "\"collection_result_id\":\"CR1\""
            + "}]");

    when(mappingMapper.listByWideTable("WT1")).thenReturn(Collections.singletonList(mapping));
    when(resultRepository.listResultsByWideTable("WT1")).thenReturn(Collections.singletonList(result));
    when(rowWriteRepository.getIndicatorValuesJson("WT1", Integer.valueOf(3))).thenReturn("{}");
    when(rowWriteRepository.updateIndicatorValues(any(WideTableRowValuePatch.class))).thenReturn(1);

    MappedResultMaterializationAppService service =
        new MappedResultMaterializationAppService(
            resultRepository,
            mappingMapper,
            rowWriteRepository,
            objectMapper);

    MappedResultMaterializationAppService.MaterializationOutcome outcome = service.materializeWideTable("WT1");

    assertEquals(1, outcome.getCollectionResultRows());
    assertEquals(1, outcome.getWideTableCells());
    assertEquals(0, outcome.getSkippedMissingRows());
    ArgumentCaptor<List<CollectionResultRow>> rowsCaptor = ArgumentCaptor.forClass(List.class);
    verify(resultRepository).insertRows(rowsCaptor.capture());
    CollectionResultRow row = rowsCaptor.getValue().get(0);
    assertEquals("FT1", row.getFetchTaskId());
    assertEquals(Integer.valueOf(3), row.getRowId());
    assertEquals("report", row.getSourceSite());
    assertEquals("https://example.com", row.getSourceUrl());
    assertEquals("evidence", row.getQuoteText());
    assertEquals("280", row.getMinValue());
    assertEquals("300", row.getMaxValue());
    assertEquals("note", row.getReasoning());

    Map<String, Object> dimensions =
        objectMapper.readValue(row.getDimensionValuesJson(), new TypeReference<Map<String, Object>>() {});
    assertEquals("Robotaxi", dimensions.get("ROBOTYPE"));
    assertEquals("2026-05-31", dimensions.get("business_date"));
    assertFalse(dimensions.containsKey("\u6307\u6807\u540d\u79f0 (Metric Name)"));
    assertFalse(dimensions.containsKey("row_id"));
  }
}
