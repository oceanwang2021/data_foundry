package com.huatai.datafoundry.backend.web;

import com.huatai.datafoundry.backend.persistence.RequirementMapper;
import com.huatai.datafoundry.backend.persistence.RequirementRecord;
import com.huatai.datafoundry.backend.persistence.WideTableMapper;
import com.huatai.datafoundry.backend.persistence.WideTableRecord;
import com.huatai.datafoundry.backend.service.TaskPlanService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Accepts plan/preview persistence requests from the frontend.
 *
 * Notes:
 * - For the current refactor phase, we only persist task groups (task instances) eagerly.
 * - Fetch tasks (sub-task instances) are generated lazily when opening/executing a task group.
 */
@RestController
@RequestMapping("/api/requirements/{requirementId}/wide-tables/{wideTableId}")
public class WideTablePlanController {
  private final RequirementMapper requirementMapper;
  private final WideTableMapper wideTableMapper;
  private final TaskPlanService taskPlanService;

  public WideTablePlanController(
      RequirementMapper requirementMapper,
      WideTableMapper wideTableMapper,
      TaskPlanService taskPlanService) {
    this.requirementMapper = requirementMapper;
    this.wideTableMapper = wideTableMapper;
    this.taskPlanService = taskPlanService;
  }

  @PostMapping("/preview")
  public Map<String, Object> persistPreview(
      @PathVariable("requirementId") String requirementId,
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody Map<String, Object> body) {
    assertWideTableExists(requirementId, wideTableId);
    // Preview rows are currently used mainly on frontend for "synthetic tasks" display.
    // We accept the payload for compatibility, but defer full row persistence until the backend domain is complete.
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  @PostMapping("/plan")
  public Map<String, Object> persistPlan(
      @PathVariable("requirementId") String requirementId,
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody Map<String, Object> body) {
    assertWideTableExists(requirementId, wideTableId);
    Object taskGroupsObj = body.get("task_groups");
    if (taskGroupsObj instanceof List) {
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> taskGroups = (List<Map<String, Object>>) taskGroupsObj;
      taskPlanService.upsertPlanTaskGroups(requirementId, wideTableId, taskGroups);
    }
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  private void assertWideTableExists(String requirementId, String wideTableId) {
    RequirementRecord requirement = requirementMapper.getById(requirementId);
    if (requirement == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    WideTableRecord wideTable = wideTableMapper.getByIdForRequirement(requirementId, wideTableId);
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
  }
}
