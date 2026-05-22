package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.requirement.application.service.AcceptanceTicketAppService;
import com.huatai.datafoundry.backend.requirement.application.service.AcceptanceTicketAppService.ApproveAndPublishOutcome;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService.TargetPublishOutcome;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/acceptance-tickets")
public class AcceptanceTicketFacadeController {
  private final AcceptanceTicketAppService acceptanceTicketAppService;

  public AcceptanceTicketFacadeController(AcceptanceTicketAppService acceptanceTicketAppService) {
    this.acceptanceTicketAppService = acceptanceTicketAppService;
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestParam(value = "requirement_id", required = false) String requirementId) {
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    for (AcceptanceTicketRecord record : acceptanceTicketAppService.list(requirementId)) {
      out.add(mapTicket(record));
    }
    return out;
  }

  @PostMapping
  public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
    return mapTicket(acceptanceTicketAppService.create(body));
  }

  @PutMapping("/{ticketId}")
  public Map<String, Object> update(
      @PathVariable("ticketId") String ticketId,
      @RequestBody(required = false) Map<String, Object> body) {
    return mapTicket(acceptanceTicketAppService.update(ticketId, body));
  }

  @PostMapping("/{ticketId}/actions/reject")
  public Map<String, Object> reject(
      @PathVariable("ticketId") String ticketId,
      @RequestBody(required = false) Map<String, Object> body) {
    return mapTicket(acceptanceTicketAppService.reject(ticketId, body));
  }

  @PostMapping("/{ticketId}/actions/approve-and-publish")
  public Map<String, Object> approveAndPublish(
      @PathVariable("ticketId") String ticketId,
      @RequestBody(required = false) Map<String, Object> body) {
    ApproveAndPublishOutcome outcome = acceptanceTicketAppService.approveAndPublish(ticketId, body);
    Map<String, Object> out = mapPublishOutcome(outcome.getPublishOutcome());
    out.put("ticket", mapTicket(outcome.getTicket()));
    return out;
  }

  private Map<String, Object> mapTicket(AcceptanceTicketRecord record) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("id", record.getId());
    out.put("requirement_id", record.getRequirementId());
    out.put("requirementId", record.getRequirementId());
    out.put("wide_table_id", record.getWideTableId());
    out.put("wideTableId", record.getWideTableId());
    out.put("task_group_id", record.getTaskGroupId());
    out.put("taskGroupId", record.getTaskGroupId());
    out.put("scope_type", record.getScopeType());
    out.put("scopeType", record.getScopeType());
    out.put("scope_key", record.getScopeKey());
    out.put("scopeKey", record.getScopeKey());
    out.put("dataset", record.getDataset());
    out.put("owner", record.getOwner());
    out.put("reviewer", record.getReviewer());
    out.put("status", record.getStatus());
    out.put("feedback", record.getFeedback());
    out.put("row_ids_json", record.getRowIdsJson());
    out.put("rowIdsJson", record.getRowIdsJson());
    out.put("publish_job_id", record.getPublishJobId());
    out.put("publishJobId", record.getPublishJobId());
    out.put("publish_error_msg", record.getPublishErrorMsg());
    out.put("publishErrorMsg", record.getPublishErrorMsg());
    out.put("approved_at", formatTime(record.getApprovedAt()));
    out.put("approvedAt", formatTime(record.getApprovedAt()));
    out.put("published_at", formatTime(record.getPublishedAt()));
    out.put("publishedAt", formatTime(record.getPublishedAt()));
    out.put("latest_action_at", formatTime(record.getLatestActionAt()));
    out.put("latestActionAt", formatTime(record.getLatestActionAt()));
    out.put("created_at", formatTime(record.getCreatedAt()));
    out.put("createdAt", formatTime(record.getCreatedAt()));
    out.put("updated_at", formatTime(record.getUpdatedAt()));
    out.put("updatedAt", formatTime(record.getUpdatedAt()));
    return out;
  }

  private Map<String, Object> mapPublishOutcome(TargetPublishOutcome outcome) {
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

  private String formatTime(LocalDateTime value) {
    return value != null ? value.toString() : null;
  }
}
