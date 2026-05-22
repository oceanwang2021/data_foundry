package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService.TargetComparisonOutcome;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService.TargetComparisonRow;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService.TargetPublishOutcome;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/wide-tables/{wideTableId}/actions")
public class WideTablePublishFacadeController {
  private final TargetTablePublishAppService targetTablePublishAppService;

  public WideTablePublishFacadeController(TargetTablePublishAppService targetTablePublishAppService) {
    this.targetTablePublishAppService = targetTablePublishAppService;
  }

  @PostMapping("/publish-to-target")
  public Map<String, Object> publishToTarget(
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody(required = false) Map<String, Object> body) {
    String taskGroupId = body != null && body.get("task_group_id") != null
        ? String.valueOf(body.get("task_group_id"))
        : body != null && body.get("taskGroupId") != null ? String.valueOf(body.get("taskGroupId")) : null;
    TargetPublishOutcome outcome = targetTablePublishAppService.publishWideTable(wideTableId, taskGroupId, readRowIds(body));
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("job_id", outcome.getJobId());
    out.put("jobId", outcome.getJobId());
    out.put("requirement_id", outcome.getRequirementId());
    out.put("requirementId", outcome.getRequirementId());
    out.put("wide_table_id", outcome.getWideTableId());
    out.put("wideTableId", outcome.getWideTableId());
    out.put("task_group_id", outcome.getTaskGroupId());
    out.put("taskGroupId", outcome.getTaskGroupId());
    out.put("target_schema", outcome.getTargetSchema());
    out.put("targetSchema", outcome.getTargetSchema());
    out.put("target_table", outcome.getTargetTable());
    out.put("targetTable", outcome.getTargetTable());
    out.put("status", outcome.getStatus());
    out.put("error_msg", outcome.getErrorMsg());
    out.put("errorMsg", outcome.getErrorMsg());
    out.put("total_rows", outcome.getTotalRows());
    out.put("totalRows", outcome.getTotalRows());
    out.put("inserted_rows", outcome.getInsertedRows());
    out.put("insertedRows", outcome.getInsertedRows());
    out.put("updated_rows", outcome.getUpdatedRows());
    out.put("updatedRows", outcome.getUpdatedRows());
    out.put("skipped_rows", outcome.getSkippedRows());
    out.put("skippedRows", outcome.getSkippedRows());
    out.put("failed_rows", outcome.getFailedRows());
    out.put("failedRows", outcome.getFailedRows());
    return out;
  }

  private List<Integer> readRowIds(Map<String, Object> body) {
    if (body == null) {
      return null;
    }
    Object raw = body.get("row_ids");
    if (raw == null) {
      raw = body.get("rowIds");
    }
    if (!(raw instanceof List<?>)) {
      return null;
    }
    List<Integer> out = new ArrayList<Integer>();
    for (Object value : (List<?>) raw) {
      if (value instanceof Number) {
        out.add(Integer.valueOf(((Number) value).intValue()));
      } else if (value != null) {
        try {
          out.add(Integer.valueOf(String.valueOf(value)));
        } catch (NumberFormatException ignored) {
        }
      }
    }
    return out;
  }

  @GetMapping("/target-comparison")
  public Map<String, Object> compareWithTarget(@PathVariable("wideTableId") String wideTableId) {
    TargetComparisonOutcome outcome = targetTablePublishAppService.compareWideTableWithTarget(wideTableId);
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("requirement_id", outcome.getRequirementId());
    out.put("requirementId", outcome.getRequirementId());
    out.put("wide_table_id", outcome.getWideTableId());
    out.put("wideTableId", outcome.getWideTableId());
    out.put("target_schema", outcome.getTargetSchema());
    out.put("targetSchema", outcome.getTargetSchema());
    out.put("target_table", outcome.getTargetTable());
    out.put("targetTable", outcome.getTargetTable());
    out.put("status", outcome.getStatus());
    out.put("total_rows", outcome.getTotalRows());
    out.put("totalRows", outcome.getTotalRows());
    out.put("matched_rows", outcome.getMatchedRows());
    out.put("matchedRows", outcome.getMatchedRows());
    out.put("missing_rows", outcome.getMissingRows());
    out.put("missingRows", outcome.getMissingRows());
    out.put("failed_rows", outcome.getFailedRows());
    out.put("failedRows", outcome.getFailedRows());
    List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
    for (TargetComparisonRow row : outcome.getRows()) {
      Map<String, Object> item = new LinkedHashMap<String, Object>();
      item.put("row_id", row.getRowId());
      item.put("rowId", row.getRowId());
      item.put("status", row.getStatus());
      item.put("message", row.getMessage());
      item.put("dimension_values", row.getDimensionValues());
      item.put("dimensionValues", row.getDimensionValues());
      item.put("previous_values", row.getPreviousValues());
      item.put("previousValues", row.getPreviousValues());
      rows.add(item);
    }
    out.put("rows", rows);
    return out;
  }
}
