package com.huatai.datafoundry.backend.targettable.interfaces.web;

import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableColumnReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.service.TargetTableQueryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
}

