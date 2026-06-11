package com.huatai.datafoundry.scheduler.schedule.infrastructure.client;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import com.huatai.datafoundry.scheduler.schedule.infrastructure.config.XxlJobProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestTemplate;

class XxlJobAdminClientTest {
  private MockRestServiceServer server;
  private XxlJobAdminClient client;

  @BeforeEach
  void setUp() {
    RestTemplate restTemplate = new RestTemplate();
    server = MockRestServiceServer.bindTo(restTemplate).build();
    XxlJobProperties properties = properties();
    client = new XxlJobAdminClient(restTemplate, new ObjectMapper(), properties);
  }

  @Test
  void createsAndStartsJobForNewRule() {
    expectLogin();
    expectGroup();
    server
        .expect(requestTo("http://127.0.0.1:8080/jobinfo/pageList"))
        .andExpect(header(HttpHeaders.COOKIE, "xxl_job_login_token=test-token"))
        .andExpect(content().string(containsString("jobDesc=%5BDF_RULE%3Arule-1%5D")))
        .andRespond(json("{\"code\":200,\"data\":{\"total\":0,\"data\":[]}}"));
    server
        .expect(requestTo("http://127.0.0.1:8080/jobinfo/insert"))
        .andExpect(content().string(containsString("executorHandler=dataCollectJobHandler")))
        .andExpect(content().string(containsString("scheduleConf=0+30+8+*+*+%3F")))
        .andRespond(json("{\"code\":200,\"data\":\"101\"}"));
    expectAction("/jobinfo/start", "101");
    server
        .expect(requestTo("http://127.0.0.1:8080/jobinfo/nextTriggerTime"))
        .andRespond(
            json("{\"code\":200,\"data\":[\"2026-06-12 08:30:00\"]}"));

    XxlJobRuleSyncResult result = client.synchronize(command(true));

    assertEquals("SYNCED", result.getStatus());
    assertEquals("101", result.getXxlJobId());
    assertEquals("3", result.getXxlJobGroup());
    assertEquals("2026-06-12T08:30:00", result.getNextTriggerTime());
    server.verify();
  }

  @Test
  void updatesExistingJobBeforeStartingIt() {
    expectLogin();
    expectGroup();
    expectExistingJob(101, 3, 1);
    server
        .expect(requestTo("http://127.0.0.1:8080/jobinfo/update"))
        .andExpect(content().string(containsString("id=101")))
        .andExpect(content().string(containsString("jobGroup=3")))
        .andRespond(json("{\"code\":200}"));
    expectAction("/jobinfo/start", "101");
    server
        .expect(requestTo("http://127.0.0.1:8080/jobinfo/nextTriggerTime"))
        .andRespond(
            json("{\"code\":200,\"data\":[\"2026-06-12 08:30:00\"]}"));

    XxlJobRuleSyncCommand command = command(true);
    command.setExistingJobId("101");
    command.setExistingJobGroup("3");
    XxlJobRuleSyncResult result = client.synchronize(command);

    assertEquals("SYNCED", result.getStatus());
    assertEquals("101", result.getXxlJobId());
    server.verify();
  }

  @Test
  void stopsExistingJobWhenRuleIsDisabled() {
    expectLogin();
    expectGroup();
    expectExistingJob(101, 3, 1);
    expectAction("/jobinfo/stop", "101");

    XxlJobRuleSyncCommand command = command(false);
    command.setExistingJobId("101");
    command.setExistingJobGroup("3");
    XxlJobRuleSyncResult result = client.synchronize(command);

    assertEquals("DISABLED", result.getStatus());
    assertEquals("101", result.getXxlJobId());
    server.verify();
  }

  private void expectLogin() {
    server
        .expect(requestTo("http://127.0.0.1:8080/auth/doLogin"))
        .andExpect(content().string(containsString("userName=admin")))
        .andRespond(loginResponse());
  }

  private void expectGroup() {
    server
        .expect(requestTo("http://127.0.0.1:8080/jobgroup/pageList"))
        .andExpect(content().string(containsString("appname=data-foundry-scheduler-local")))
        .andRespond(
            json(
                "{\"code\":200,\"data\":{\"total\":1,\"data\":["
                    + "{\"id\":3,\"appname\":\"data-foundry-scheduler-local\"}]}}"));
  }

  private void expectExistingJob(int id, int groupId, int triggerStatus) {
    server
        .expect(requestTo("http://127.0.0.1:8080/jobinfo/pageList"))
        .andRespond(
            json(
                "{\"code\":200,\"data\":{\"total\":1,\"data\":["
                    + "{\"id\":"
                    + id
                    + ",\"jobGroup\":"
                    + groupId
                    + ",\"triggerStatus\":"
                    + triggerStatus
                    + ",\"jobDesc\":\"[DF_RULE:rule-1] Monthly rule\"}]}}"));
  }

  private void expectAction(String path, String jobId) {
    server
        .expect(requestTo("http://127.0.0.1:8080" + path))
        .andExpect(content().string(containsString("ids%5B%5D=" + jobId)))
        .andRespond(json("{\"code\":200}"));
  }

  private static ResponseCreator json(String body) {
    return withSuccess(body, MediaType.APPLICATION_JSON);
  }

  private static ResponseCreator loginResponse() {
    return request -> {
      org.springframework.http.client.ClientHttpResponse response =
          withSuccess("{\"code\":200}", MediaType.APPLICATION_JSON)
              .createResponse(request);
      response
          .getHeaders()
          .add(
              HttpHeaders.SET_COOKIE,
              "xxl_job_login_token=test-token; Path=/; HttpOnly");
      return response;
    };
  }

  private static XxlJobProperties properties() {
    XxlJobProperties properties = new XxlJobProperties();
    properties.getAdmin().setAddresses("http://127.0.0.1:8080");
    properties.getAdmin().setUsername("admin");
    properties.getAdmin().setPassword("123456");
    properties.getExecutor().setAppname("data-foundry-scheduler-local");
    properties.getSync().setGroupTitle("Data Foundry Scheduler Local");
    properties.getSync().setAuthor("data-foundry-local");
    return properties;
  }

  private static XxlJobRuleSyncCommand command(boolean enabled) {
    XxlJobRuleSyncCommand command = new XxlJobRuleSyncCommand();
    command.setRuleId("rule-1");
    command.setRuleName("Monthly rule");
    command.setFrequency("MONTHLY");
    command.setCronExpression("0 30 8 * * ?");
    command.setBusinessDateMode("PREVIOUS_PERIOD");
    command.setJobHandler("dataCollectJobHandler");
    command.setEnabled(Boolean.valueOf(enabled));
    command.setSyncHash("hash-1");
    return command;
  }
}
