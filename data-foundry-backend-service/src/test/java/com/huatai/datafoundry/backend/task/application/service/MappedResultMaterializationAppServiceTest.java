package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.application.service.MappedResultMaterializationAppService.MaterializationOutcome;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import com.huatai.datafoundry.backend.task.domain.model.WideTableRowValuePatch;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.MetricFieldMappingMapper;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

public class MappedResultMaterializationAppServiceTest {

  @Test
  @SuppressWarnings({"unchecked", "rawtypes"})
  void materializesRowsWhenMetricHeaderContainsIndicatorAndName() {
    CollectionResultRepository collectionResultRepository = mock(CollectionResultRepository.class);
    MetricFieldMappingMapper mappingMapper = mock(MetricFieldMappingMapper.class);
    WideTableRowWriteRepository rowWriteRepository = mock(WideTableRowWriteRepository.class);
    MappedResultMaterializationAppService service =
        new MappedResultMaterializationAppService(
            collectionResultRepository, mappingMapper, rowWriteRepository, new ObjectMapper());
    MetricFieldMapping mapping = new MetricFieldMapping();
    mapping.setSourceMetricName("\u4e8b\u6545\u7387");
    mapping.setTargetIndicatorKey("TECHACCIDENTRATE");
    mapping.setTargetIndicatorName("\u4e8b\u6545\u7387");
    mapping.setStatus("confirmed");
    CollectionResult result = new CollectionResult();
    result.setId("CR1");
    result.setFetchTaskId("FT1");
    result.setScheduleJobId("SJ1");
    result.setWideTableId("WT1");
    result.setRowId(7);
    result.setNormalizedRowsJson(
        "[{\"\\u6307\\u6807\\u641c\\u7d22\\u540d\\u79f0\":\"\\u4e8b\\u6545\\u7387\","
            + "\"value\":\"0.12\"}]");

    when(mappingMapper.listByWideTable("WT1")).thenReturn(Collections.singletonList(mapping));
    when(collectionResultRepository.listResultsByWideTable("WT1"))
        .thenReturn(Collections.singletonList(result));
    when(rowWriteRepository.getIndicatorValuesJson("WT1", 7)).thenReturn("{}");
    when(rowWriteRepository.updateIndicatorValues(org.mockito.ArgumentMatchers.any(WideTableRowValuePatch.class)))
        .thenReturn(1);

    MaterializationOutcome outcome = service.materializeWideTable("WT1");

    assertEquals(1, outcome.getCollectionResultRows());
    assertEquals(1, outcome.getWideTableCells());
    ArgumentCaptor<List> rowsCaptor = ArgumentCaptor.forClass(List.class);
    verify(collectionResultRepository).insertRows(rowsCaptor.capture());
    List<CollectionResultRow> detailRows = rowsCaptor.getValue();
    assertEquals("\u4e8b\u6545\u7387", detailRows.get(0).getSourceMetricName());
    assertEquals("TECHACCIDENTRATE", detailRows.get(0).getTargetIndicatorKey());
    ArgumentCaptor<WideTableRowValuePatch> patchCaptor =
        ArgumentCaptor.forClass(WideTableRowValuePatch.class);
    verify(rowWriteRepository).updateIndicatorValues(patchCaptor.capture());
    assertTrue(patchCaptor.getValue().getIndicatorValuesJson().contains("TECHACCIDENTRATE"));
  }
}
