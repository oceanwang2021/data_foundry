package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableReadRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

public class CollectionResultAppServiceTest {

  @Test
  void parsesFirstMarkdownTableWithOriginalColumnNames() {
    CollectionResultAppService service = newService(mock(CollectionResultRepository.class));
    String markdown =
        "before\n"
            + "| comcode | \u4f01\u4e1a\u540d\u79f0 | algodesc (\u7b97\u6cd5\u8def\u7ebf) |\n"
            + "| ------- | -------- | ------------------- |\n"
            + "| 3344180 | \u96f6\u8dd1\u6c7d\u8f66 | A<br>B |\n"
            + "| 8036928 | \u5c0f\u9e4f\u6c7d\u8f66 | C |\n"
            + "\n"
            + "| ignored | value |\n"
            + "| ------- | ----- |\n"
            + "| x | y |\n";

    List<Map<String, String>> rows = service.parseFirstMarkdownTable(markdown);

    assertEquals(2, rows.size());
    assertEquals("3344180", rows.get(0).get("comcode"));
    assertEquals("\u96f6\u8dd1\u6c7d\u8f66", rows.get(0).get("\u4f01\u4e1a\u540d\u79f0"));
    assertEquals("A<br>B", rows.get(0).get("algodesc (\u7b97\u6cd5\u8def\u7ebf)"));
    assertEquals("8036928", rows.get(1).get("comcode"));
    assertTrue(rows.get(0).containsKey("algodesc (\u7b97\u6cd5\u8def\u7ebf)"));
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
  void normalizeFinalReportStoresCanonicalRowsFromTaskDimensions() {
    CollectionResultRepository repository = mock(CollectionResultRepository.class);
    FetchTaskRepository fetchTaskRepository = mock(FetchTaskRepository.class);
    CollectionResult result = new CollectionResult();
    result.setId("CR1");
    result.setFetchTaskId("FT1");
    result.setRowId(7);
    result.setFinalReport(
        "| comcode | \u6307\u6807\u540d | \u53d6\u503c | \u5355\u4f4d | \u6570\u636e\u6765\u6e90 | Notes |\n"
            + "| ------- | -------- | ---- | ---- | -------- | ----- |\n"
            + "| BAD | \u8f66\u961f\u6570\u91cf | 300 | \u8f86 | report | ok |\n");
    FetchTask task = new FetchTask();
    task.setId("FT1");
    task.setRowId(7);
    task.setBusinessDate("2026-05-31");
    task.setDimensionValuesJson("{\"ROBOTYPE\":\"Robotaxi\",\"COMCODE\":\"10028149\"}");
    when(repository.getResultByTaskAndId("FT1", "CR1")).thenReturn(result);
    when(fetchTaskRepository.getById("FT1")).thenReturn(task);
    CollectionResultAppService service = newService(repository, fetchTaskRepository);

    CollectionResult updated = service.normalizeFinalReport("FT1", "CR1");

    List<Map<String, String>> rows = readRows(updated.getNormalizedRowsJson());
    Map<String, String> row = rows.get(0);
    String[] keys = row.keySet().toArray(new String[0]);
    assertEquals("ROBOTYPE", keys[0]);
    assertEquals("collection_result_id", keys[keys.length - 1]);
    assertEquals("Robotaxi", row.get("ROBOTYPE"));
    assertEquals("10028149", row.get("COMCODE"));
    assertEquals("2026-05-31", row.get("business_date"));
    assertEquals("\u8f66\u961f\u6570\u91cf", row.get("\u6307\u6807\u540d\u79f0 (Metric Name)"));
    assertEquals("300", row.get("\u6307\u6807\u503c (Value)"));
    assertEquals("\u8f86", row.get("\u5355\u4f4d (Unit)"));
    assertEquals("report", row.get("\u6570\u636e\u6765\u6e90 (Data Source)"));
    assertEquals("ok", row.get("\u903b\u8f91\u8bf4\u660e\u53ca\u8865\u5145 (Notes)"));
    assertEquals("", row.get("Min_Value"));
    assertEquals("7", row.get("row_id"));
    assertEquals("FT1", row.get("fetch_task_id"));
    assertEquals("CR1", row.get("collection_result_id"));
    assertTrue(!row.containsKey("comcode"));
    verify(repository).updateNormalizedRowsJson(eq("FT1"), eq("CR1"), anyString());
  }

  @Test
  void normalizeTaskGroupFinalReportsParsesEachResultWithItsOwnHeader() {
    CollectionResultRepository repository = mock(CollectionResultRepository.class);
    FetchTaskRepository fetchTaskRepository = mock(FetchTaskRepository.class);
    CollectionResult first = new CollectionResult();
    first.setId("CR1");
    first.setFetchTaskId("FT1");
    first.setFinalReport(
        "| \u6307\u6807\u540d\u79f0 | \u6307\u6807\u503c | \u5355\u4f4d |\n"
            + "| -------- | ---- | ---- |\n"
            + "| \u8f66\u961f\u6570\u91cf | 300 | \u8f86 |\n");
    CollectionResult second = new CollectionResult();
    second.setId("CR2");
    second.setFetchTaskId("FT2");
    second.setFinalReport(
        "| Metric Name | Value | Unit | Source_URL |\n"
            + "| ----------- | ----- | ---- | ---------- |\n"
            + "| miles | 1000 | km | https://example.com |\n");
    FetchTask firstTask = new FetchTask();
    firstTask.setId("FT1");
    firstTask.setRowId(1);
    firstTask.setDimensionValuesJson("{\"COMCODE\":\"10028149\"}");
    FetchTask secondTask = new FetchTask();
    secondTask.setId("FT2");
    secondTask.setRowId(2);
    secondTask.setDimensionValuesJson("{\"COMCODE\":\"7461206\"}");
    when(repository.listResultsByTaskGroup("TG1")).thenReturn(Arrays.asList(first, second));
    when(fetchTaskRepository.getById("FT1")).thenReturn(firstTask);
    when(fetchTaskRepository.getById("FT2")).thenReturn(secondTask);
    CollectionResultAppService service = newService(repository, fetchTaskRepository);

    List<CollectionResult> updated = service.normalizeTaskGroupFinalReports("TG1");

    List<Map<String, String>> firstRows = readRows(updated.get(0).getNormalizedRowsJson());
    List<Map<String, String>> secondRows = readRows(updated.get(1).getNormalizedRowsJson());
    assertEquals(1, firstRows.size());
    assertEquals(1, secondRows.size());
    assertEquals("\u8f66\u961f\u6570\u91cf", firstRows.get(0).get("\u6307\u6807\u540d\u79f0 (Metric Name)"));
    assertEquals("miles", secondRows.get(0).get("\u6307\u6807\u540d\u79f0 (Metric Name)"));
    assertEquals("https://example.com", secondRows.get(0).get("Source_URL"));
    verify(repository).updateNormalizedRowsJson(eq("FT1"), eq("CR1"), anyString());
    verify(repository).updateNormalizedRowsJson(eq("FT2"), eq("CR2"), anyString());
  }

  private CollectionResultAppService newService(CollectionResultRepository repository) {
    return newService(repository, mock(FetchTaskRepository.class));
  }

  private CollectionResultAppService newService(
      CollectionResultRepository repository,
      FetchTaskRepository fetchTaskRepository) {
    return new CollectionResultAppService(
        repository,
        fetchTaskRepository,
        mock(WideTableRowWriteRepository.class),
        mock(WideTableReadRepository.class),
        new ObjectMapper());
  }

  private List<Map<String, String>> readRows(String json) {
    try {
      return new ObjectMapper().readValue(json, new TypeReference<List<Map<String, String>>>() {});
    } catch (Exception ex) {
      throw new AssertionError(ex);
    }
  }
}
