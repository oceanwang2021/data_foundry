package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.targettable.application.query.service.TargetTableQueryService;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.MetricFieldMappingMapper;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

public class MetricFieldMappingAppServiceTest {

  @Test
  @SuppressWarnings({"unchecked", "rawtypes"})
  void generatesSourceMetricNamesFromBroadChineseMetricHeaders() {
    MetricFieldMappingMapper mappingMapper = mock(MetricFieldMappingMapper.class);
    CollectionResultRepository collectionResultRepository = mock(CollectionResultRepository.class);
    WideTableMapper wideTableMapper = mock(WideTableMapper.class);
    TargetTableQueryService targetTableQueryService = mock(TargetTableQueryService.class);
    MetricFieldMappingAppService service =
        new MetricFieldMappingAppService(
            mappingMapper,
            collectionResultRepository,
            wideTableMapper,
            targetTableQueryService,
            new ObjectMapper());
    WideTableRecord wideTable = new WideTableRecord();
    wideTable.setId("WT1");
    wideTable.setRequirementId("REQ1");
    wideTable.setSchemaJson("{}");
    CollectionResult result = new CollectionResult();
    result.setNormalizedRowsJson(
        "[{\"\\u6307\\u6807\\u641c\\u7d22\\u540d\\u79f0\":\"\\u4e8b\\u6545\\u7387\"},"
            + "{\"\\u6307\\u6807\\u540d\":\"\\u5355\\u8f66\\u6210\\u672c\"}]");

    when(wideTableMapper.getById("WT1")).thenReturn(wideTable);
    when(collectionResultRepository.listResultsByWideTable("WT1"))
        .thenReturn(Collections.singletonList(result));
    when(mappingMapper.listByWideTable("WT1"))
        .thenReturn(Collections.<MetricFieldMapping>emptyList());

    service.generateFromWideTableResults("WT1");

    ArgumentCaptor<List> captor = ArgumentCaptor.forClass(List.class);
    verify(mappingMapper).upsertGenerated(captor.capture());
    List<MetricFieldMapping> generated = captor.getValue();
    assertEquals(2, generated.size());
    assertEquals("\u4e8b\u6545\u7387", generated.get(0).getSourceMetricName());
    assertEquals("\u5355\u8f66\u6210\u672c", generated.get(1).getSourceMetricName());
  }
}
