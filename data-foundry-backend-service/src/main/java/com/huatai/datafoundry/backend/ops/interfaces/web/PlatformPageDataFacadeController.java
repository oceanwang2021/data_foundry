package com.huatai.datafoundry.backend.ops.interfaces.web;

import com.huatai.datafoundry.backend.ops.application.query.service.PlatformPageDataQueryService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PlatformPageDataFacadeController {
  private final PlatformPageDataQueryService platformPageDataQueryService;

  public PlatformPageDataFacadeController(PlatformPageDataQueryService platformPageDataQueryService) {
    this.platformPageDataQueryService = platformPageDataQueryService;
  }

  @GetMapping("/api/projects/overview")
  public List<Map<String, Object>> getProjectOverview() {
    return platformPageDataQueryService.getProjectOverview();
  }

  @GetMapping("/api/collection-tasks/overview")
  public Map<String, Object> getCollectionTasksOverview() {
    return platformPageDataQueryService.getCollectionTasksOverview();
  }

  @GetMapping("/api/acceptance/overview")
  public Map<String, Object> getAcceptanceOverview() {
    return platformPageDataQueryService.getAcceptanceOverview();
  }

  @GetMapping("/api/scheduling/context")
  public Map<String, Object> getSchedulingContext() {
    return platformPageDataQueryService.getSchedulingContext();
  }
}
