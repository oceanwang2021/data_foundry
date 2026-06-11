package com.huatai.datafoundry.scheduler.schedule.infrastructure.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.XxlJobAdminGateway;
import com.huatai.datafoundry.scheduler.schedule.infrastructure.config.XxlJobProperties;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Component
public class XxlJobAdminClient implements XxlJobAdminGateway {
  private static final DateTimeFormatter ADMIN_TIME_FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final DateTimeFormatter RESULT_TIME_FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

  private final RestTemplate restTemplate;
  private final ObjectMapper objectMapper;
  private final XxlJobProperties properties;
  private volatile String sessionCookie;

  public XxlJobAdminClient(
      @Qualifier("xxlJobAdminRestTemplate") RestTemplate restTemplate,
      ObjectMapper objectMapper,
      XxlJobProperties properties) {
    this.restTemplate = restTemplate;
    this.objectMapper = objectMapper;
    this.properties = properties;
  }

  @Override
  public synchronized XxlJobRuleSyncResult synchronize(XxlJobRuleSyncCommand command) {
    validate(command);
    authenticate();

    int configuredGroupId = resolveOrCreateGroup();
    Map<String, Object> existingJob =
        findExistingJob(command, configuredGroupId);
    if (!Boolean.TRUE.equals(command.getEnabled())) {
      return disable(command, existingJob, configuredGroupId);
    }

    int jobId;
    if (existingJob == null) {
      jobId = createJob(command, configuredGroupId);
    } else {
      jobId = intValue(existingJob.get("id"), "XXL-JOB task id");
      updateJob(command, configuredGroupId, jobId);
    }
    invokeJobAction("/jobinfo/start", jobId);

    XxlJobRuleSyncResult result = baseResult(command);
    result.setStatus("SYNCED");
    result.setXxlJobId(String.valueOf(jobId));
    result.setXxlJobGroup(String.valueOf(configuredGroupId));
    result.setExecutorName(properties.getExecutor().getAppname());
    result.setNextTriggerTime(nextTriggerTime(command.getCronExpression()));
    return result;
  }

  private XxlJobRuleSyncResult disable(
      XxlJobRuleSyncCommand command,
      Map<String, Object> existingJob,
      int configuredGroupId) {
    XxlJobRuleSyncResult result = baseResult(command);
    result.setStatus("DISABLED");
    result.setExecutorName(properties.getExecutor().getAppname());
    if (existingJob != null) {
      int jobId = intValue(existingJob.get("id"), "XXL-JOB task id");
      invokeJobAction("/jobinfo/stop", jobId);
      result.setXxlJobId(String.valueOf(jobId));
      result.setXxlJobGroup(
          String.valueOf(intValue(existingJob.get("jobGroup"), "XXL-JOB group id")));
    } else if (command.getExistingJobId() != null) {
      result.setXxlJobId(command.getExistingJobId());
      result.setXxlJobGroup(
          command.getExistingJobGroup() != null
              ? command.getExistingJobGroup()
              : String.valueOf(configuredGroupId));
    }
    return result;
  }

  private Map<String, Object> findExistingJob(
      XxlJobRuleSyncCommand command, int configuredGroupId) {
    Integer existingGroupId = nullableInt(command.getExistingJobGroup());
    if (existingGroupId != null) {
      Map<String, Object> job =
          findJob(existingGroupId.intValue(), command.getExistingJobId(), marker(command));
      if (job != null) {
        return job;
      }
    }
    if (existingGroupId == null || existingGroupId.intValue() != configuredGroupId) {
      return findJob(configuredGroupId, command.getExistingJobId(), marker(command));
    }
    return null;
  }

  private Map<String, Object> findJob(int groupId, String expectedJobId, String marker) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    form.add("offset", "0");
    form.add("pagesize", "100");
    form.add("jobGroup", String.valueOf(groupId));
    form.add("triggerStatus", "-1");
    form.add("jobDesc", marker);
    form.add("executorHandler", "");
    form.add("author", "");
    Map<String, Object> response = postForm("/jobinfo/pageList", form);
    Map<String, Object> page = mapValue(response.get("data"));
    for (Map<String, Object> job : mapList(page.get("data"))) {
      String id = stringValue(job.get("id"));
      String description = stringValue(job.get("jobDesc"));
      if ((expectedJobId != null && expectedJobId.equals(id))
          || (description != null && description.contains(marker))) {
        return job;
      }
    }
    return null;
  }

  private int resolveOrCreateGroup() {
    String appName = requireText(properties.getExecutor().getAppname(), "executor appname");
    Integer groupId = findGroup(appName);
    if (groupId != null) {
      return groupId.intValue();
    }

    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    form.add("appname", appName);
    form.add("title", properties.getSync().getGroupTitle());
    form.add("addressType", "0");
    form.add("addressList", "");
    postForm("/jobgroup/insert", form);
    groupId = findGroup(appName);
    if (groupId == null) {
      throw new IllegalStateException("XXL-JOB executor group was created but cannot be loaded");
    }
    return groupId.intValue();
  }

  private Integer findGroup(String appName) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    form.add("offset", "0");
    form.add("pagesize", "100");
    form.add("appname", appName);
    form.add("title", "");
    Map<String, Object> response = postForm("/jobgroup/pageList", form);
    Map<String, Object> page = mapValue(response.get("data"));
    for (Map<String, Object> group : mapList(page.get("data"))) {
      if (appName.equals(stringValue(group.get("appname")))) {
        return Integer.valueOf(intValue(group.get("id"), "XXL-JOB group id"));
      }
    }
    return null;
  }

  private int createJob(XxlJobRuleSyncCommand command, int groupId) {
    Map<String, Object> response = postForm("/jobinfo/insert", jobForm(command, groupId, null));
    return intValue(response.get("data"), "created XXL-JOB task id");
  }

  private void updateJob(XxlJobRuleSyncCommand command, int groupId, int jobId) {
    postForm("/jobinfo/update", jobForm(command, groupId, Integer.valueOf(jobId)));
  }

  private MultiValueMap<String, String> jobForm(
      XxlJobRuleSyncCommand command, int groupId, Integer jobId) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    if (jobId != null) {
      form.add("id", String.valueOf(jobId));
    }
    form.add("jobGroup", String.valueOf(groupId));
    form.add("jobDesc", marker(command) + " " + safeText(command.getRuleName()));
    form.add("author", properties.getSync().getAuthor());
    form.add("alarmEmail", "");
    form.add("scheduleType", "CRON");
    form.add("scheduleConf", requireText(command.getCronExpression(), "cron expression"));
    form.add("misfireStrategy", "DO_NOTHING");
    form.add("executorRouteStrategy", "FIRST");
    form.add("executorHandler", requireText(command.getJobHandler(), "job handler"));
    form.add("executorParam", executorParam(command));
    form.add("executorBlockStrategy", "SERIAL_EXECUTION");
    form.add("executorTimeout", "0");
    form.add("executorFailRetryCount", "0");
    form.add("glueType", "BEAN");
    form.add("glueSource", "");
    form.add("glueRemark", "GLUE code initialization");
    form.add("childJobId", "");
    return form;
  }

  private String executorParam(XxlJobRuleSyncCommand command) {
    java.util.LinkedHashMap<String, Object> param =
        new java.util.LinkedHashMap<String, Object>();
    param.put("ruleId", command.getRuleId());
    param.put("frequency", command.getFrequency());
    param.put("triggerType", "SCHEDULED");
    param.put("businessDateMode", command.getBusinessDateMode());
    param.put("operator", "xxl-job-auto-sync");
    try {
      return objectMapper.writeValueAsString(param);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Cannot serialize XXL-JOB executor parameters", ex);
    }
  }

  private void invokeJobAction(String path, int jobId) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    form.add("ids[]", String.valueOf(jobId));
    postForm(path, form);
  }

  private String nextTriggerTime(String cronExpression) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    form.add("scheduleType", "CRON");
    form.add("scheduleConf", cronExpression);
    Map<String, Object> response = postForm("/jobinfo/nextTriggerTime", form);
    Object data = response.get("data");
    if (!(data instanceof List) || ((List<?>) data).isEmpty()) {
      return null;
    }
    String first = stringValue(((List<?>) data).get(0));
    return first != null
        ? LocalDateTime.parse(first, ADMIN_TIME_FORMAT).format(RESULT_TIME_FORMAT)
        : null;
  }

  private void authenticate() {
    String username = requireText(properties.getAdmin().getUsername(), "XXL-JOB admin username");
    String password = requireText(properties.getAdmin().getPassword(), "XXL-JOB admin password");
    MultiValueMap<String, String> form = new LinkedMultiValueMap<String, String>();
    form.add("userName", username);
    form.add("password", password);
    form.add("ifRemember", "on");

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
    ResponseEntity<Map> response =
        restTemplate.exchange(
            url("/auth/doLogin"),
            HttpMethod.POST,
            new HttpEntity<MultiValueMap<String, String>>(form, headers),
            Map.class);
    assertSuccess(response.getBody(), "XXL-JOB Admin login");
    List<String> cookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
    if (cookies == null || cookies.isEmpty()) {
      throw new IllegalStateException("XXL-JOB Admin login did not return a session cookie");
    }
    List<String> cookiePairs = new ArrayList<String>();
    for (String cookie : cookies) {
      if (cookie != null && !cookie.trim().isEmpty()) {
        cookiePairs.add(cookie.split(";", 2)[0]);
      }
    }
    sessionCookie = join(cookiePairs, "; ");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> postForm(
      String path, MultiValueMap<String, String> form) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
    headers.add(HttpHeaders.COOKIE, requireText(sessionCookie, "XXL-JOB Admin session"));
    try {
      ResponseEntity<Map> response =
          restTemplate.exchange(
              url(path),
              HttpMethod.POST,
              new HttpEntity<MultiValueMap<String, String>>(form, headers),
              Map.class);
      Map<String, Object> body = (Map<String, Object>) response.getBody();
      assertSuccess(body, "XXL-JOB Admin request " + path);
      return body;
    } catch (RestClientException ex) {
      throw new IllegalStateException("XXL-JOB Admin request failed: " + path, ex);
    }
  }

  private String url(String path) {
    String addresses = requireText(properties.getAdmin().getAddresses(), "XXL-JOB Admin address");
    String baseUrl = addresses.split(",", 2)[0].trim();
    while (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
    }
    return baseUrl + path;
  }

  private static void assertSuccess(Map<?, ?> response, String operation) {
    if (response == null || intValue(response.get("code"), operation + " response code") != 200) {
      throw new IllegalStateException(
          operation + " failed: " + (response != null ? response.get("msg") : "empty response"));
    }
  }

  private static XxlJobRuleSyncResult baseResult(XxlJobRuleSyncCommand command) {
    XxlJobRuleSyncResult result = new XxlJobRuleSyncResult();
    result.setRuleId(command.getRuleId());
    result.setSyncHash(command.getSyncHash());
    return result;
  }

  private static void validate(XxlJobRuleSyncCommand command) {
    if (command == null) {
      throw new IllegalArgumentException("XXL-JOB sync command is required");
    }
    requireText(command.getRuleId(), "schedule rule id");
    requireText(command.getSyncHash(), "schedule rule sync hash");
  }

  private static String marker(XxlJobRuleSyncCommand command) {
    return "[DF_RULE:" + command.getRuleId() + "]";
  }

  private static String safeText(String value) {
    return value == null ? "" : value.trim();
  }

  private static String requireText(String value, String label) {
    if (value == null || value.trim().isEmpty()) {
      throw new IllegalStateException(label + " is required");
    }
    return value.trim();
  }

  private static int intValue(Object value, String label) {
    if (value instanceof Number) {
      return ((Number) value).intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(value));
    } catch (Exception ex) {
      throw new IllegalStateException(label + " is invalid: " + value, ex);
    }
  }

  private static Integer nullableInt(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    try {
      return Integer.valueOf(value.trim());
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  private static String stringValue(Object value) {
    return value != null ? String.valueOf(value) : null;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> mapValue(Object value) {
    return value instanceof Map
        ? (Map<String, Object>) value
        : Collections.<String, Object>emptyMap();
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> mapList(Object value) {
    if (!(value instanceof List)) {
      return Collections.emptyList();
    }
    List<Map<String, Object>> result = new ArrayList<Map<String, Object>>();
    for (Object item : (List<Object>) value) {
      if (item instanceof Map) {
        result.add((Map<String, Object>) item);
      }
    }
    return result;
  }

  private static String join(List<String> values, String delimiter) {
    StringBuilder result = new StringBuilder();
    for (String value : values) {
      if (result.length() > 0) {
        result.append(delimiter);
      }
      result.append(value);
    }
    return result.toString();
  }
}
