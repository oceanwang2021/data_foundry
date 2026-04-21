package com.huatai.datafoundry.backend.webmvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.huatai.datafoundry.backend.requirement.application.command.RequirementCreateCommand;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.RequirementAppService;
import com.huatai.datafoundry.backend.requirement.interfaces.web.RequirementFacadeController;
import com.huatai.datafoundry.backend.requirement.interfaces.web.legacy.RequirementLegacyController;
import com.huatai.datafoundry.backend.requirement.interfaces.web.legacy.RequirementTaskLegacyController;
import com.huatai.datafoundry.backend.requirement.interfaces.web.legacy.RequirementWideTableLegacyController;
import com.huatai.datafoundry.backend.requirement.interfaces.web.legacy.WideTablePlanLegacyController;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.application.query.service.ProjectQueryService;
import com.huatai.datafoundry.backend.project.interfaces.web.ProjectFacadeController;
import com.huatai.datafoundry.backend.ops.application.service.DemoDataService;
import com.huatai.datafoundry.backend.task.application.service.ScheduleJobFacadeAppService;
import com.huatai.datafoundry.backend.task.application.service.TaskAppService;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJob;
import com.huatai.datafoundry.backend.task.interfaces.web.ScheduleJobFacadeController;
import com.huatai.datafoundry.backend.task.interfaces.web.TaskFacadeController;
import com.huatai.datafoundry.backend.task.interfaces.web.legacy.TaskExecutionLegacyController;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.huatai.datafoundry.backend.ops.interfaces.web.PlatformStubController;

@WebMvcTest(
    controllers = {
      RequirementFacadeController.class,
      TaskFacadeController.class,
      ScheduleJobFacadeController.class,
      ProjectFacadeController.class,
      PlatformStubController.class,
      // Legacy controllers (routes must remain stable)
      RequirementLegacyController.class,
      RequirementTaskLegacyController.class,
      RequirementWideTableLegacyController.class,
      WideTablePlanLegacyController.class,
      TaskExecutionLegacyController.class,
    })
@TestPropertySource(properties = {"spring.jackson.property-naming-strategy=SNAKE_CASE"})
public class M6RoutingWebMvcTest {
  @Autowired private MockMvc mockMvc;

  @MockBean private RequirementAppService requirementAppService;
  @MockBean private RequirementQueryService requirementQueryService;
  @MockBean private TaskAppService taskAppService;
  @MockBean private ScheduleJobFacadeAppService scheduleJobFacadeAppService;
  @MockBean private ProjectQueryService projectQueryService;
  @MockBean private DemoDataService demoDataService;

  @Test
  void legacyAndCanonicalRequirementListReturnWideTableSnakeCase() throws Exception {
    RequirementReadDto dto = new RequirementReadDto();
    dto.setId("REQ-2026-TEST");
    dto.setProjectId("P1");
    dto.setTitle("t");
    WideTableReadDto wt = new WideTableReadDto();
    wt.setId("WT-2026-TEST");
    wt.setTitle("primary");
    dto.setWideTable(wt);

    when(requirementQueryService.listByProject("P1")).thenReturn(Collections.singletonList(dto));

    mockMvc
        .perform(get("/api/projects/P1/requirements"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("REQ-2026-TEST"))
        .andExpect(jsonPath("$[0].wide_table.id").value("WT-2026-TEST"));

    mockMvc
        .perform(get("/api/requirements").queryParam("project_id", "P1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("REQ-2026-TEST"))
        .andExpect(jsonPath("$[0].wide_table.id").value("WT-2026-TEST"));
  }

  @Test
  void legacyAndCanonicalRequirementCreateAreWired() throws Exception {
    doNothing()
        .when(requirementAppService)
        .createRequirement(anyString(), anyString(), anyString(), any(RequirementCreateCommand.class));
    when(requirementQueryService.getByProjectAndId(eq("P1"), anyString()))
        .thenAnswer(
            inv -> {
              String rid = inv.getArgument(1);
              RequirementReadDto out = new RequirementReadDto();
              out.setId(rid);
              out.setProjectId("P1");
              out.setTitle("t");
              return out;
            });
    when(requirementQueryService.getPrimaryWideTableByRequirement(anyString()))
        .thenAnswer(
            inv -> {
              WideTableReadDto out = new WideTableReadDto();
              out.setId("WT-PRIMARY");
              out.setTitle("primary");
              return out;
            });

    String body =
        "{"
            + "\"title\":\"t\","
            + "\"phase\":\"production\","
            + "\"wide_table\":{"
            + "  \"title\":\"primary\","
            + "  \"indicator_groups\":[],"
            + "  \"schedule_rules\":[]"
            + "}"
            + "}";

    mockMvc
        .perform(
            post("/api/projects/P1/requirements")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").exists())
        .andExpect(jsonPath("$.wide_table.id").value("WT-PRIMARY"));

    mockMvc
        .perform(
            post("/api/requirements")
                .queryParam("project_id", "P1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").exists())
        .andExpect(jsonPath("$.wide_table.id").value("WT-PRIMARY"));
  }

  @Test
  void canonicalTaskFacadeRoutesAreWired() throws Exception {
    TaskGroupReadDto tg = new TaskGroupReadDto();
    tg.setId("TG1");
    FetchTaskReadDto ft = new FetchTaskReadDto();
    ft.setId("FT1");
    when(requirementQueryService.listTaskGroups("P1", "R1")).thenReturn(Collections.singletonList(tg));
    when(requirementQueryService.listFetchTasks("P1", "R1")).thenReturn(Collections.singletonList(ft));

    Map<String, Object> ok = new HashMap<String, Object>();
    ok.put("ok", true);
    when(taskAppService.ensureTasks("TG1")).thenReturn(ok);
    when(taskAppService.executeTaskGroup(eq("TG1"), any(Map.class), any())).thenReturn(ok);
    when(taskAppService.executeTask(eq("FT1"), any())).thenReturn(ok);
    when(taskAppService.retryTask(eq("FT1"), any())).thenReturn(ok);

    mockMvc
        .perform(get("/api/tasks/task-groups").queryParam("project_id", "P1").queryParam("requirement_id", "R1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("TG1"));

    mockMvc
        .perform(get("/api/tasks").queryParam("project_id", "P1").queryParam("requirement_id", "R1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("FT1"));

    mockMvc
        .perform(
            post("/api/tasks/task-groups/TG1/actions/ensure-tasks")
                .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true));

    mockMvc
        .perform(
            post("/api/tasks/task-groups/TG1/actions/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true));

    mockMvc
        .perform(post("/api/tasks/FT1/actions/execute").contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true));

    mockMvc
        .perform(post("/api/tasks/FT1/actions/retry").contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true));
  }

  @Test
  void scheduleJobFacadeCreateUsesIdempotencyHeaderWhenPresent() throws Exception {
    ScheduleJob job = new ScheduleJob();
    job.setId("SJ1");
    job.setStatus("running");
    when(scheduleJobFacadeAppService.createWithIdempotency(any(), anyString())).thenReturn(job);
    when(scheduleJobFacadeAppService.create(any())).thenReturn(job);

    String body = "{\"task_group_id\":\"TG1\",\"trigger_type\":\"manual\",\"operator\":\"tester\"}";

    mockMvc
        .perform(
            post("/api/schedule-jobs")
                .header("X-Idempotency-Key", "k1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("SJ1"));

    verify(scheduleJobFacadeAppService).createWithIdempotency(any(), eq("k1"));
  }

  @Test
  void projectsFacadeRoutesAreWired() throws Exception {
    ProjectReadDto p = new ProjectReadDto();
    p.setId("P1");
    p.setName("n");
    when(projectQueryService.list()).thenReturn(Collections.singletonList(p));
    when(projectQueryService.getById("P1")).thenReturn(p);

    mockMvc
        .perform(get("/api/projects"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("P1"));

    mockMvc
        .perform(get("/api/projects/P1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("P1"));
  }

  @Test
  void platformStubDashboardAndAdminGuardsAreWired() throws Exception {
    DemoDataService.DemoMetrics m = new DemoDataService.DemoMetrics();
    m.projects = 1;
    m.requirements = 2;
    when(demoDataService.metrics()).thenReturn(m);

    mockMvc
        .perform(get("/api/dashboard/metrics"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.projects").value(1))
        .andExpect(jsonPath("$.requirements").value(2));

    mockMvc
        .perform(post("/api/admin/seed").contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isForbidden());
  }
}
