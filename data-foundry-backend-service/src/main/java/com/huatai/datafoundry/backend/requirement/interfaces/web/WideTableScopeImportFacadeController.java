package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableScopeImportMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableScopeImportRecord;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/wide-tables/{wideTableId}/scope-import")
public class WideTableScopeImportFacadeController {
  private final WideTableScopeImportMapper wideTableScopeImportMapper;

  public WideTableScopeImportFacadeController(WideTableScopeImportMapper wideTableScopeImportMapper) {
    this.wideTableScopeImportMapper = wideTableScopeImportMapper;
  }

  @GetMapping("/download")
  public ResponseEntity<byte[]> downloadScopeImport(@PathVariable("wideTableId") String wideTableId) {
    WideTableScopeImportRecord record = wideTableScopeImportMapper.getByWideTableId(wideTableId);
    if (record == null || record.getFileContent() == null || record.getFileContent().trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved CSV import not found");
    }

    MediaType mediaType = MediaType.TEXT_PLAIN;
    try {
      if (record.getFileType() != null && !record.getFileType().trim().isEmpty()) {
        mediaType = MediaType.parseMediaType(record.getFileType());
      }
    } catch (Exception ignore) {
      mediaType = MediaType.TEXT_PLAIN;
    }

    String fileName =
        record.getFileName() != null && !record.getFileName().trim().isEmpty()
            ? record.getFileName().trim()
            : "scope-import.csv";

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(mediaType);
    headers.setContentDisposition(
        ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build());

    return new ResponseEntity<byte[]>(
        record.getFileContent().getBytes(StandardCharsets.UTF_8),
        headers,
        HttpStatus.OK);
  }
}
