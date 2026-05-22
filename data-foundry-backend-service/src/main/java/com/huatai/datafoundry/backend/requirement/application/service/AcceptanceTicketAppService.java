package com.huatai.datafoundry.backend.requirement.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.AcceptanceTicketMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService.TargetPublishOutcome;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.TaskGroupMapper;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.record.TaskGroupRecord;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AcceptanceTicketAppService {
  private static final Set<String> ALLOWED_STATUSES = new LinkedHashSet<String>();

  static {
    ALLOWED_STATUSES.add("pending");
    ALLOWED_STATUSES.add("rejected");
    ALLOWED_STATUSES.add("fixing");
    ALLOWED_STATUSES.add("publishing");
    ALLOWED_STATUSES.add("partial_approved");
    ALLOWED_STATUSES.add("approved");
    ALLOWED_STATUSES.add("publish_failed");
    ALLOWED_STATUSES.add("deleted");
  }

  private final AcceptanceTicketMapper acceptanceTicketMapper;
  private final TaskGroupMapper taskGroupMapper;
  private final WideTableMapper wideTableMapper;
  private final WideTableRowMapper wideTableRowMapper;
  private final TargetTablePublishAppService targetTablePublishAppService;
  private final ObjectMapper objectMapper;

  public AcceptanceTicketAppService(
      AcceptanceTicketMapper acceptanceTicketMapper,
      TaskGroupMapper taskGroupMapper,
      WideTableMapper wideTableMapper,
      WideTableRowMapper wideTableRowMapper,
      TargetTablePublishAppService targetTablePublishAppService,
      ObjectMapper objectMapper) {
    this.acceptanceTicketMapper = acceptanceTicketMapper;
    this.taskGroupMapper = taskGroupMapper;
    this.wideTableMapper = wideTableMapper;
    this.wideTableRowMapper = wideTableRowMapper;
    this.targetTablePublishAppService = targetTablePublishAppService;
    this.objectMapper = objectMapper;
  }

  public List<AcceptanceTicketRecord> list(String requirementId) {
    return acceptanceTicketMapper.list(trimToNull(requirementId));
  }

  @Transactional
  public AcceptanceTicketRecord create(Map<String, Object> body) {
    String requirementId = requireText(value(body, "requirement_id", "requirementId"), "requirement_id is required");
    String taskGroupId = trimToNull(value(body, "task_group_id", "taskGroupId"));
    String wideTableId = trimToNull(value(body, "wide_table_id", "wideTableId"));
    String scopeType = trimToNull(value(body, "scope_type", "scopeType"));
    String scopeKey = trimToNull(value(body, "scope_key", "scopeKey"));

    TaskGroupRecord taskGroup = null;
    if (taskGroupId != null) {
      taskGroup = taskGroupMapper.getById(taskGroupId);
      if (taskGroup == null) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TaskGroup not found");
      }
      wideTableId = firstNonBlank(wideTableId, taskGroup.getWideTableId());
      scopeType = "task_group";
      scopeKey = taskGroupId;
    } else {
      scopeType = firstNonBlank(scopeType, "wide_table");
      scopeKey = firstNonBlank(scopeKey, wideTableId, requirementId);
      if ("wide_table".equals(scopeType) && wideTableId == null) {
        wideTableId = scopeKey;
      }
    }

    AcceptanceTicketRecord existing = acceptanceTicketMapper.getByScope(requirementId, scopeType, scopeKey);
    if (existing != null && (body == null || !body.containsKey("status"))) {
      return existing;
    }

    LocalDateTime now = LocalDateTime.now();
    AcceptanceTicketRecord record = existing != null ? existing : new AcceptanceTicketRecord();
    if (record.getId() == null) {
      record.setId("AT-" + UUID.randomUUID().toString().replace("-", "").substring(0, 24));
    }
    record.setRequirementId(requirementId);
    record.setWideTableId(wideTableId);
    record.setTaskGroupId(taskGroupId);
    record.setScopeType(scopeType);
    record.setScopeKey(scopeKey);
    record.setDataset(trimToNull(value(body, "dataset")));
    record.setOwner(trimToNull(value(body, "owner")));
    record.setReviewer(trimToNull(value(body, "reviewer")));
    record.setStatus(normalizeStatus(firstNonBlank(value(body, "status"), "pending")));
    record.setFeedback(trimToNull(value(body, "feedback")));
    record.setLatestActionAt(now);
    if ("approved".equals(record.getStatus())) {
      record.setApprovedAt(now);
    }
    acceptanceTicketMapper.upsert(record);
    return acceptanceTicketMapper.getByScope(requirementId, scopeType, scopeKey);
  }

  @Transactional
  public AcceptanceTicketRecord update(String ticketId, Map<String, Object> body) {
    AcceptanceTicketRecord existing = requireTicket(ticketId);
    LocalDateTime now = LocalDateTime.now();
    AcceptanceTicketRecord patch = new AcceptanceTicketRecord();
    patch.setId(existing.getId());
    if (has(body, "status")) {
      String status = normalizeStatus(value(body, "status"));
      patch.setStatus(status);
      if ("approved".equals(status)) {
        patch.setApprovedAt(now);
      }
      patch.setLatestActionAt(now);
    }
    if (has(body, "feedback")) {
      patch.setFeedback(trimToNull(value(body, "feedback")));
      patch.setLatestActionAt(now);
    }
    if (has(body, "owner")) {
      patch.setOwner(trimToNull(value(body, "owner")));
    }
    if (has(body, "reviewer")) {
      patch.setReviewer(trimToNull(value(body, "reviewer")));
    }
    acceptanceTicketMapper.update(patch);
    return requireTicket(ticketId);
  }

  @Transactional
  public AcceptanceTicketRecord reject(String ticketId, Map<String, Object> body) {
    AcceptanceTicketRecord patch = new AcceptanceTicketRecord();
    patch.setId(requireTicket(ticketId).getId());
    patch.setStatus("rejected");
    patch.setFeedback(trimToNull(value(body, "feedback")));
    patch.setReviewer(trimToNull(value(body, "reviewer")));
    patch.setLatestActionAt(LocalDateTime.now());
    acceptanceTicketMapper.update(patch);
    return requireTicket(ticketId);
  }

  @Transactional
  public ApproveAndPublishOutcome approveAndPublish(String ticketId, Map<String, Object> body) {
    AcceptanceTicketRecord ticket = requireTicket(ticketId);
    if ("deleted".equals(ticket.getStatus())) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Acceptance ticket is deleted");
    }
    String wideTableId = requireText(ticket.getWideTableId(), "wide_table_id is required");
    WideTableRecord wideTable = wideTableMapper.getById(wideTableId);
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
    List<Integer> rowIds = readRowIds(body);
    validateRowIds(ticket, rowIds);

    LocalDateTime now = LocalDateTime.now();
    AcceptanceTicketRecord publishing = new AcceptanceTicketRecord();
    publishing.setId(ticket.getId());
    publishing.setStatus("publishing");
    publishing.setRowIdsJson(rowIds != null ? writeJson(rowIds) : null);
    publishing.setReviewer(trimToNull(value(body, "reviewer")));
    publishing.setLatestActionAt(now);
    acceptanceTicketMapper.update(publishing);

    TargetPublishOutcome publishOutcome =
        targetTablePublishAppService.publishWideTable(wideTableId, ticket.getTaskGroupId(), rowIds);

    LocalDateTime finishedAt = LocalDateTime.now();
    AcceptanceTicketRecord done = new AcceptanceTicketRecord();
    done.setId(ticket.getId());
    done.setPublishJobId(publishOutcome.getJobId());
    done.setLatestActionAt(finishedAt);
    if (publishOutcome.getFailedRows() > 0 || "failed".equals(publishOutcome.getStatus())) {
      done.setStatus("publish_failed");
      done.setPublishErrorMsg(firstNonBlank(publishOutcome.getErrorMsg(), "publish failed"));
    } else if (isPartialApproval(ticket, rowIds)) {
      done.setStatus("partial_approved");
      done.setPublishErrorMsg("");
      done.setPublishedAt(finishedAt);
    } else {
      done.setStatus("approved");
      done.setPublishErrorMsg("");
      done.setApprovedAt(finishedAt);
      done.setPublishedAt(finishedAt);
    }
    acceptanceTicketMapper.update(done);

    ApproveAndPublishOutcome out = new ApproveAndPublishOutcome();
    out.ticket = requireTicket(ticketId);
    out.publishOutcome = publishOutcome;
    return out;
  }

  private boolean isPartialApproval(AcceptanceTicketRecord ticket, List<Integer> rowIds) {
    if (rowIds == null) {
      return false;
    }
    List<WideTableRowRecord> rows = wideTableRowMapper.listByWideTableId(ticket.getWideTableId());
    if (rows == null || rows.isEmpty()) {
      return false;
    }
    return rowIds.size() < rows.size();
  }

  private void validateRowIds(AcceptanceTicketRecord ticket, List<Integer> rowIds) {
    if (rowIds == null) {
      return;
    }
    if (rowIds.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "row_ids must not be empty");
    }

    List<WideTableRowRecord> rows = wideTableRowMapper.listByWideTableId(ticket.getWideTableId());
    Set<Integer> existingRows = new LinkedHashSet<Integer>();
    for (WideTableRowRecord row : rows) {
      if (row.getRowId() != null) {
        existingRows.add(row.getRowId());
      }
    }
    for (Integer rowId : rowIds) {
      if (!existingRows.contains(rowId)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "row_id does not belong to wide table: " + rowId);
      }
    }

  }

  private AcceptanceTicketRecord requireTicket(String ticketId) {
    String id = requireText(ticketId, "ticketId is required");
    AcceptanceTicketRecord record = acceptanceTicketMapper.getById(id);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Acceptance ticket not found");
    }
    return record;
  }

  private List<Integer> readRowIds(Map<String, Object> body) {
    Object raw = body != null && body.get("row_ids") != null ? body.get("row_ids") : body != null ? body.get("rowIds") : null;
    if (raw == null) {
      return null;
    }
    if (!(raw instanceof List<?>)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "row_ids must be an array");
    }
    List<Integer> out = new ArrayList<Integer>();
    for (Object value : (List<?>) raw) {
      if (value instanceof Number) {
        out.add(Integer.valueOf(((Number) value).intValue()));
      } else if (value != null) {
        try {
          out.add(Integer.valueOf(String.valueOf(value)));
        } catch (NumberFormatException ex) {
          throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "row_ids contains invalid value: " + value);
        }
      }
    }
    return out;
  }

  private String normalizeStatus(String status) {
    String normalized = trimToNull(status);
    if (normalized == null) {
      return "pending";
    }
    if (!ALLOWED_STATUSES.contains(normalized)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported acceptance status: " + normalized);
    }
    return normalized;
  }

  private boolean has(Map<String, Object> body, String key) {
    return body != null && body.containsKey(key);
  }

  private String value(Map<String, Object> body, String... keys) {
    if (body == null || keys == null) {
      return null;
    }
    for (String key : keys) {
      Object value = body.get(key);
      if (value != null) {
        return String.valueOf(value);
      }
    }
    return null;
  }

  private String requireText(String value, String message) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
    return normalized;
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      String normalized = trimToNull(value);
      if (normalized != null) {
        return normalized;
      }
    }
    return null;
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid JSON payload");
    }
  }

  public static class ApproveAndPublishOutcome {
    private AcceptanceTicketRecord ticket;
    private TargetPublishOutcome publishOutcome;

    public AcceptanceTicketRecord getTicket() { return ticket; }
    public TargetPublishOutcome getPublishOutcome() { return publishOutcome; }
  }
}
