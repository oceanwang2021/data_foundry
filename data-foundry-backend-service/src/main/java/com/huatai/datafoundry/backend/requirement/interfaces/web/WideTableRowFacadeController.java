package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableRowReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.WideTableRowQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.WideTableRowAppService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/wide-tables/{wideTableId}/rows")
public class WideTableRowFacadeController {
  private final WideTableRowQueryService wideTableRowQueryService;
  private final WideTableRowAppService wideTableRowAppService;

  public WideTableRowFacadeController(
      WideTableRowQueryService wideTableRowQueryService,
      WideTableRowAppService wideTableRowAppService) {
    this.wideTableRowQueryService = wideTableRowQueryService;
    this.wideTableRowAppService = wideTableRowAppService;
  }

  @GetMapping
  public List<WideTableRowReadDto> listRows(
      @PathVariable("wideTableId") String wideTableId,
      @RequestParam(value = "batch_id", required = false) String batchId) {
    // batch_id is reserved for future snapshot reads; current scope uses wide_table_rows only.
    return wideTableRowQueryService.listByWideTableId(wideTableId);
  }

  @PutMapping("/{rowId}")
  public Map<String, Object> updateRow(
      @PathVariable("wideTableId") String wideTableId,
      @PathVariable("rowId") Integer rowId,
      @RequestBody(required = false) Map<String, Object> body) {
    wideTableRowAppService.updateRow(wideTableId, rowId, body);
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }
}

