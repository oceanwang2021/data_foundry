package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableReadRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

public class CollectionResultAppServiceTest {

  @Test
  void parsesFirstMarkdownTableWithOriginalColumnNames() {
    CollectionResultAppService service = newService(mock(CollectionResultRepository.class));
    String markdown =
        "before\n"
            + "| comcode | 企业名称 | algodesc (算法路线) |\n"
            + "| ------- | -------- | ------------------- |\n"
            + "| 3344180 | 零跑汽车 | A<br>B |\n"
            + "| 8036928 | 小鹏汽车 | C |\n"
            + "\n"
            + "| ignored | value |\n"
            + "| ------- | ----- |\n"
            + "| x | y |\n";

    List<Map<String, String>> rows = service.parseFirstMarkdownTable(markdown);

    assertEquals(2, rows.size());
    assertEquals("3344180", rows.get(0).get("comcode"));
    assertEquals("零跑汽车", rows.get(0).get("企业名称"));
    assertEquals("A<br>B", rows.get(0).get("algodesc (算法路线)"));
    assertEquals("8036928", rows.get(1).get("comcode"));
    assertTrue(rows.get(0).containsKey("algodesc (算法路线)"));
  }

  @Test
  void parsesMarkdownTableWhenHeadingAndHeaderAreOnSameLine() {
    CollectionResultAppService service = newService(mock(CollectionResultRepository.class));
    String markdown =
        "### table: demo | comcode | company | algodesc |\n"
            + "| ------- | ------- | -------- |\n"
            + "| 3344180 | car A | algo A |\n";

    List<Map<String, String>> rows = service.parseFirstMarkdownTable(markdown);

    assertEquals(1, rows.size());
    assertEquals("3344180", rows.get(0).get("comcode"));
    assertEquals("car A", rows.get(0).get("company"));
    assertEquals("algo A", rows.get(0).get("algodesc"));
    assertTrue(!rows.get(0).containsKey("### table: demo"));
  }

  @Test
  void parsesLooseMarkdownTableWhenMetadataAndHeaderAreOnSameLine() {
    CollectionResultAppService service = newService(mock(CollectionResultRepository.class));
    String markdown =
        "### \u8868\u540d: \u81ea\u52a8\u9a7e\u9a76\u516c\u53f8\u8fd0\u8425\u6307\u6807\u957f\u8868"
            + " (AD Company Metrics Long Format) | \u4e1a\u6001\u7c7b\u522b (Business Type) | comcode"
            + " | \u6307\u6807\u540d\u79f0 (Metric Name) | \u6307\u6807\u503c (Value) |\n"
            + "| Robobus | 3344180 | \u4e8b\u6545\u7387 | 0.12 |\n";

    List<Map<String, String>> rows = service.parseFirstMarkdownTable(markdown);

    assertEquals(1, rows.size());
    assertEquals("Robobus", rows.get(0).get("\u4e1a\u6001\u7c7b\u522b (Business Type)"));
    assertEquals("3344180", rows.get(0).get("comcode"));
    assertEquals("\u4e8b\u6545\u7387", rows.get(0).get("\u6307\u6807\u540d\u79f0 (Metric Name)"));
    assertEquals("0.12", rows.get(0).get("\u6307\u6807\u503c (Value)"));
    assertTrue(!rows.get(0).containsKey("### \u8868\u540d: \u81ea\u52a8\u9a7e\u9a76\u516c\u53f8\u8fd0\u8425\u6307\u6807\u957f\u8868 (AD Company Metrics Long Format)"));
  }

  @Test
  void keepsRowsWhenCellContainsExtraPipe() {
    CollectionResultAppService service = newService(mock(CollectionResultRepository.class));
    String markdown =
        "| comcode | \u6307\u6807\u540d\u79f0 | Source_Evidence |\n"
            + "| ------- | -------- | --------------- |\n"
            + "| 3344180 | \u4e8b\u6545\u7387 | A | B |\n";

    List<Map<String, String>> rows = service.parseFirstMarkdownTable(markdown);

    assertEquals(1, rows.size());
    assertEquals("3344180", rows.get(0).get("comcode"));
    assertEquals("\u4e8b\u6545\u7387", rows.get(0).get("\u6307\u6807\u540d\u79f0"));
    assertEquals("A | B", rows.get(0).get("Source_Evidence"));
  }

  @Test
  void invalidMarkdownTableReturnsEmptyRows() {
    CollectionResultAppService service = newService(mock(CollectionResultRepository.class));
    String markdown =
        "| a | b |\n"
            + "| -- | -- |\n"
            + "| 1 | 2 |\n";

    assertTrue(service.parseFirstMarkdownTable(markdown).isEmpty());
  }

  @Test
  void normalizeFinalReportStoresNullWhenNoTableRows() {
    CollectionResultRepository repository = mock(CollectionResultRepository.class);
    CollectionResult result = new CollectionResult();
    result.setId("CR1");
    result.setFetchTaskId("FT1");
    result.setFinalReport("no table");
    when(repository.getResultByTaskAndId("FT1", "CR1")).thenReturn(result);
    CollectionResultAppService service = newService(repository);

    CollectionResult updated = service.normalizeFinalReport("FT1", "CR1");

    assertEquals(null, updated.getNormalizedRowsJson());
    verify(repository).updateNormalizedRowsJson("FT1", "CR1", null);
  }

  @Test
  void normalizeFinalReportStoresJsonRows() {
    CollectionResultRepository repository = mock(CollectionResultRepository.class);
    CollectionResult result = new CollectionResult();
    result.setId("CR1");
    result.setFetchTaskId("FT1");
    result.setFinalReport("| colA | 中文列 |\n| ---- | ------ |\n| v1 | 值1 |\n");
    when(repository.getResultByTaskAndId("FT1", "CR1")).thenReturn(result);
    CollectionResultAppService service = newService(repository);

    CollectionResult updated = service.normalizeFinalReport("FT1", "CR1");

    assertEquals("[{\"colA\":\"v1\",\"中文列\":\"值1\"}]", updated.getNormalizedRowsJson());
    verify(repository).updateNormalizedRowsJson("FT1", "CR1", "[{\"colA\":\"v1\",\"中文列\":\"值1\"}]");
  }

  private CollectionResultAppService newService(CollectionResultRepository repository) {
    return new CollectionResultAppService(
        repository,
        mock(WideTableRowWriteRepository.class),
        mock(WideTableReadRepository.class),
        new ObjectMapper());
  }
}
