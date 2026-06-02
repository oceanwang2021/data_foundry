package com.huatai.datafoundry.backend.requirement.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.AcceptanceTicketMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService;
import com.huatai.datafoundry.backend.targettable.application.service.TargetTablePublishAppService.TargetPublishOutcome;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.TaskGroupMapper;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

public class AcceptanceTicketAppServiceTest {

  @Test
  void approvedTicketStaysApprovedWhenRepublishingOnlyCurrentPageRows() {
    AcceptanceTicketMapper ticketMapper = mock(AcceptanceTicketMapper.class);
    TaskGroupMapper taskGroupMapper = mock(TaskGroupMapper.class);
    WideTableMapper wideTableMapper = mock(WideTableMapper.class);
    WideTableRowMapper wideTableRowMapper = mock(WideTableRowMapper.class);
    TargetTablePublishAppService publishAppService = mock(TargetTablePublishAppService.class);

    AcceptanceTicketRecord ticket = new AcceptanceTicketRecord();
    ticket.setId("AT1");
    ticket.setRequirementId("REQ1");
    ticket.setWideTableId("WT1");
    ticket.setStatus("approved");

    WideTableRecord wideTable = new WideTableRecord();
    wideTable.setId("WT1");
    wideTable.setRequirementId("REQ1");
    wideTable.setTableName("IR_ADAS_L4OPERATIONINFOAI_LITE");

    WideTableRowRecord row1 = new WideTableRowRecord();
    row1.setWideTableId("WT1");
    row1.setRowId(Integer.valueOf(1));
    WideTableRowRecord row2 = new WideTableRowRecord();
    row2.setWideTableId("WT1");
    row2.setRowId(Integer.valueOf(2));

    TargetPublishOutcome publishOutcome = new TargetPublishOutcome();
    publishOutcome.setJobId("TPJ1");
    publishOutcome.setStatus("success");
    publishOutcome.setFailedRows(0);
    publishOutcome.setWideTableId("WT1");

    when(ticketMapper.getById("AT1")).thenReturn(ticket);
    when(ticketMapper.update(any(AcceptanceTicketRecord.class))).thenReturn(1);
    when(wideTableMapper.getById("WT1")).thenReturn(wideTable);
    when(wideTableRowMapper.listByWideTableId("WT1")).thenReturn(Arrays.asList(row1, row2));
    when(publishAppService.publishWideTable("WT1", null, Arrays.asList(Integer.valueOf(1))))
        .thenReturn(publishOutcome);

    AcceptanceTicketAppService service =
        new AcceptanceTicketAppService(
            ticketMapper,
            taskGroupMapper,
            wideTableMapper,
            wideTableRowMapper,
            publishAppService,
            new ObjectMapper());

    Map<String, Object> body = new LinkedHashMap<String, Object>();
    body.put("row_ids", Arrays.asList(Integer.valueOf(1)));

    service.approveAndPublish("AT1", body);

    ArgumentCaptor<AcceptanceTicketRecord> captor =
        ArgumentCaptor.forClass(AcceptanceTicketRecord.class);
    verify(ticketMapper, org.mockito.Mockito.times(2)).update(captor.capture());
    List<AcceptanceTicketRecord> updates = captor.getAllValues();
    assertEquals("publishing", updates.get(0).getStatus());
    assertEquals("approved", updates.get(1).getStatus());
  }
}
