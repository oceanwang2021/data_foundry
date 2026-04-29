package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.requirement.application.command.RequirementCreateCommand;
import com.huatai.datafoundry.backend.requirement.application.command.RequirementUpdateCommand;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementSearchPageReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.RequirementAppService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Canonical facade for Requirement application service.
 *
 * <p>Notes:
 * - This controller is additive: it does not change any existing legacy routes.
 * - Response remains "raw JSON" (no Response&lt;T&gt; wrapper) to match current frontend expectations.
 */
@RestController
@RequestMapping("/api/requirements")
public class RequirementFacadeController {
  private final RequirementAppService requirementAppService;
  private final RequirementQueryService requirementQueryService;

  public RequirementFacadeController(
      RequirementAppService requirementAppService,
      RequirementQueryService requirementQueryService) {
    this.requirementAppService = requirementAppService;
    this.requirementQueryService = requirementQueryService;
  }

  @GetMapping
  public List<RequirementReadDto> list(@RequestParam("project_id") String projectId) {
    return requirementQueryService.listByProject(projectId);
  }

  @GetMapping("/search")
  public RequirementSearchPageReadDto search(
      @RequestParam(value = "keyword", required = false) String keyword,
      @RequestParam(value = "project_id", required = false) String projectId,
      @RequestParam(value = "owner", required = false) String owner,
      @RequestParam(value = "assignee", required = false) String assignee,
      @RequestParam(value = "status", required = false) List<String> statuses,
      @RequestParam(value = "wide_table_id", required = false) String wideTableId,
      @RequestParam(value = "wide_table_keyword", required = false) String wideTableKeyword,
      @RequestParam(value = "has_wide_table", required = false) Boolean hasWideTable,
      @RequestParam(value = "sort_by", required = false, defaultValue = "updated_at") String sortBy,
      @RequestParam(value = "sort_dir", required = false, defaultValue = "desc") String sortDir,
      @RequestParam(value = "page", required = false, defaultValue = "1") int page,
      @RequestParam(value = "page_size", required = false, defaultValue = "20") int pageSize) {
    String normalizedKeyword = keyword != null ? keyword.trim() : null;
    String normalizedProjectId = projectId != null ? projectId.trim() : null;
    String normalizedOwner = owner != null ? owner.trim() : null;
    String normalizedAssignee = assignee != null ? assignee.trim() : null;
    String normalizedWideTableId = wideTableId != null ? wideTableId.trim() : null;
    String normalizedWideTableKeyword = wideTableKeyword != null ? wideTableKeyword.trim() : null;

    return requirementQueryService.search(
        normalizedKeyword != null && !normalizedKeyword.isEmpty() ? normalizedKeyword : null,
        normalizedProjectId != null && !normalizedProjectId.isEmpty() ? normalizedProjectId : null,
        normalizedOwner != null && !normalizedOwner.isEmpty() ? normalizedOwner : null,
        normalizedAssignee != null && !normalizedAssignee.isEmpty() ? normalizedAssignee : null,
        normalizeStatuses(statuses),
        normalizedWideTableId != null && !normalizedWideTableId.isEmpty() ? normalizedWideTableId : null,
        normalizedWideTableKeyword != null && !normalizedWideTableKeyword.isEmpty() ? normalizedWideTableKeyword : null,
        hasWideTable,
        sortBy,
        sortDir,
        page,
        pageSize);
  }

  private static List<String> normalizeStatuses(List<String> raw) {
    if (raw == null || raw.isEmpty()) {
      return raw;
    }
    List<String> out = new ArrayList<String>();
    for (String s : raw) {
      if (s == null) continue;
      String v = s.trim();
      if (v.isEmpty()) continue;
      // Frontend uses normalized statuses; DB may store legacy values.
      if ("aligning".equalsIgnoreCase(v)) {
        out.add("scoping");
        continue;
      }
      if ("running".equalsIgnoreCase(v)) {
        out.add("running");
        out.add("stabilized");
        continue;
      }
      out.add(v);
    }
    return out.isEmpty() ? raw : out;
  }

  @PostMapping
  public RequirementReadDto create(
      @RequestParam("project_id") String projectId,
      @RequestBody RequirementCreateCommand request) {
    String requirementId = RequirementAppService.buildRequirementId();
    String wideTableId = buildWideTableId();
    requirementAppService.createRequirement(projectId, requirementId, wideTableId, request);

    RequirementReadDto refreshed = requirementQueryService.getByProjectAndId(projectId, requirementId);
    WideTableReadDto primary = requirementQueryService.getPrimaryWideTableByRequirement(requirementId);
    refreshed.setWideTable(primary);
    return refreshed;
  }

  @GetMapping("/{requirementId}")
  public RequirementReadDto get(
      @RequestParam("project_id") String projectId,
      @PathVariable("requirementId") String requirementId) {
    return requirementQueryService.getByProjectAndId(projectId, requirementId);
  }

  @PutMapping("/{requirementId}")
  public RequirementReadDto update(
      @RequestParam("project_id") String projectId,
      @PathVariable("requirementId") String requirementId,
      @RequestBody RequirementUpdateCommand request) {
    requirementAppService.updateByProjectAndId(projectId, requirementId, request);
    return requirementQueryService.getByProjectAndId(projectId, requirementId);
  }

  private static String buildWideTableId() {
    int year = LocalDate.now().getYear();
    String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    return String.format("WT-%d-%s", year, token);
  }
}
