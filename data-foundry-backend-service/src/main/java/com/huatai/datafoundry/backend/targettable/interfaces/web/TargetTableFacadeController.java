package com.huatai.datafoundry.backend.targettable.interfaces.web;

import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableColumnReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.service.TargetTableQueryService;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/target-tables")
public class TargetTableFacadeController {
  private final TargetTableQueryService targetTableQueryService;

  public TargetTableFacadeController(TargetTableQueryService targetTableQueryService) {
    this.targetTableQueryService = targetTableQueryService;
  }

  @GetMapping
  public List<TargetTableReadDto> listTargetTables(
      @RequestParam(value = "keyword", required = false) String keyword) {
    return targetTableQueryService.listTables(keyword);
  }

  @GetMapping("/{tableName}/columns")
  public List<TargetTableColumnReadDto> listTargetTableColumns(
      @PathVariable("tableName") String tableName) {
    return targetTableQueryService.listColumns(tableName);
  }

  @PostMapping("/query-preview")
  public Map<String, Object> previewParameterRowsSql(@RequestBody Map<String, Object> body) {
    String sql = body != null && body.get("sql") != null ? String.valueOf(body.get("sql")) : "";
    Integer limit = null;
    if (body != null && body.get("limit") instanceof Number) {
      limit = Integer.valueOf(((Number) body.get("limit")).intValue());
    }
    try {
      return targetTableQueryService.previewSelectSql(sql, limit);
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
    } catch (IllegalStateException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, rootMessage(ex), ex);
    }
  }

  private static String rootMessage(Throwable error) {
    Throwable cursor = error;
    while (cursor.getCause() != null) {
      cursor = cursor.getCause();
    }
    String message = cursor.getMessage();
    return message != null && !message.trim().isEmpty() ? message : error.getMessage();
  }
}

