package com.huatai.datafoundry.agent.health.interfaces.web;

import java.util.HashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
  @GetMapping("/health")
  public Map<String, String> health() {
    Map<String, String> out = new HashMap<String, String>();
    out.put("status", "ok");
    return out;
  }
}
