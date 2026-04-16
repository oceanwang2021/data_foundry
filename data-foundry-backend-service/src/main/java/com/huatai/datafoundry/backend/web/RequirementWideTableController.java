package com.huatai.datafoundry.backend.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.persistence.RequirementMapper;
import com.huatai.datafoundry.backend.persistence.RequirementRecord;
import com.huatai.datafoundry.backend.persistence.WideTableMapper;
import com.huatai.datafoundry.backend.persistence.WideTableRecord;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/requirements/{requirementId}/wide-tables")
public class RequirementWideTableController {
  private final RequirementMapper requirementMapper;
  private final WideTableMapper wideTableMapper;
  private final ObjectMapper objectMapper;

  public RequirementWideTableController(
      RequirementMapper requirementMapper,
      WideTableMapper wideTableMapper,
      ObjectMapper objectMapper) {
    this.requirementMapper = requirementMapper;
    this.wideTableMapper = wideTableMapper;
    this.objectMapper = objectMapper;
  }

  @PutMapping("/{wideTableId}")
  public RequirementController.WideTableResponse update(
      @PathVariable("requirementId") String requirementId,
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody WideTableUpdateRequest request) {
    RequirementRecord requirement = requirementMapper.getById(requirementId);
    if (requirement == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    if (Boolean.TRUE.equals(requirement.getSchemaLocked())) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Requirement schema is locked");
    }

    WideTableRecord existing = wideTableMapper.getByIdForRequirement(requirementId, wideTableId);
    if (existing == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }

    WideTableRecord toUpdate = new WideTableRecord();
    toUpdate.setId(existing.getId());
    toUpdate.setRequirementId(existing.getRequirementId());
    toUpdate.setTitle(request.getTitle());
    toUpdate.setDescription(request.getDescription());
    toUpdate.setSemanticTimeAxis(request.getSemanticTimeAxis());
    toUpdate.setCollectionCoverageMode(request.getCollectionCoverageMode());

    // Serialize structured configs to JSON strings for MySQL JSON columns.
    toUpdate.setSchemaJson(writeJson(request.getSchema()));
    toUpdate.setScopeJson(writeJson(request.getScope()));
    toUpdate.setIndicatorGroupsJson(writeJson(request.getIndicatorGroups()));
    toUpdate.setScheduleRulesJson(writeJson(request.getScheduleRules()));

    Integer schemaVersion = inferSchemaVersion(request.getSchema());
    if (schemaVersion != null) {
      toUpdate.setSchemaVersion(schemaVersion);
    }

    int updated = wideTableMapper.updateByIdAndRequirement(toUpdate);
    if (updated <= 0) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update wide table");
    }

    WideTableRecord refreshed = wideTableMapper.getByIdForRequirement(requirementId, wideTableId);
    return RequirementController.WideTableResponse.from(refreshed, objectMapper);
  }

  private String writeJson(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return null;
    }
  }

  private Integer inferSchemaVersion(Object schema) {
    if (!(schema instanceof Map)) {
      return null;
    }
    Object version = ((Map<?, ?>) schema).get("version");
    if (version instanceof Number) {
      return ((Number) version).intValue();
    }
    return null;
  }

  public static class WideTableUpdateRequest {
    private String title;
    private String description;
    private Object schema;
    private Object scope;
    private Object indicatorGroups;
    private Object scheduleRules;
    private String semanticTimeAxis;
    private String collectionCoverageMode;

    public String getTitle() {
      return title;
    }

    public void setTitle(String title) {
      this.title = title;
    }

    public String getDescription() {
      return description;
    }

    public void setDescription(String description) {
      this.description = description;
    }

    public Object getSchema() {
      return schema;
    }

    public void setSchema(Object schema) {
      this.schema = schema;
    }

    public Object getScope() {
      return scope;
    }

    public void setScope(Object scope) {
      this.scope = scope;
    }

    public Object getIndicatorGroups() {
      return indicatorGroups;
    }

    public void setIndicatorGroups(Object indicatorGroups) {
      this.indicatorGroups = indicatorGroups;
    }

    public Object getScheduleRules() {
      return scheduleRules;
    }

    public void setScheduleRules(Object scheduleRules) {
      this.scheduleRules = scheduleRules;
    }

    public String getSemanticTimeAxis() {
      return semanticTimeAxis;
    }

    public void setSemanticTimeAxis(String semanticTimeAxis) {
      this.semanticTimeAxis = semanticTimeAxis;
    }

    public String getCollectionCoverageMode() {
      return collectionCoverageMode;
    }

    public void setCollectionCoverageMode(String collectionCoverageMode) {
      this.collectionCoverageMode = collectionCoverageMode;
    }
  }
}

