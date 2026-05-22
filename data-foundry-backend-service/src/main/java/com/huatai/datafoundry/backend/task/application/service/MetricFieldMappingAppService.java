package com.huatai.datafoundry.backend.task.application.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableColumnReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.service.TargetTableQueryService;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.MetricFieldMappingMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MetricFieldMappingAppService {
  private static final TypeReference<List<Map<String, Object>>> ROW_LIST_REF =
      new TypeReference<List<Map<String, Object>>>() {};
  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};

  private final MetricFieldMappingMapper mappingMapper;
  private final CollectionResultRepository collectionResultRepository;
  private final WideTableMapper wideTableMapper;
  private final TargetTableQueryService targetTableQueryService;
  private final ObjectMapper objectMapper;

  public MetricFieldMappingAppService(
      MetricFieldMappingMapper mappingMapper,
      CollectionResultRepository collectionResultRepository,
      WideTableMapper wideTableMapper,
      TargetTableQueryService targetTableQueryService,
      ObjectMapper objectMapper) {
    this.mappingMapper = mappingMapper;
    this.collectionResultRepository = collectionResultRepository;
    this.wideTableMapper = wideTableMapper;
    this.targetTableQueryService = targetTableQueryService;
    this.objectMapper = objectMapper;
  }

  public List<MetricFieldMapping> listByWideTable(String wideTableId) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      return Collections.emptyList();
    }
    return mappingMapper.listByWideTable(wideTableId.trim());
  }

  @Transactional
  public List<MetricFieldMapping> generateFromWideTableResults(String wideTableId) {
    WideTableRecord wideTable = requireWideTable(wideTableId);
    List<CollectionResult> results = collectionResultRepository.listResultsByWideTable(wideTable.getId());
    Set<String> sourceMetricNames = extractSourceMetricNames(results);
    Map<String, TargetIndicator> targets = loadTargetIndicators(wideTable);
    List<MetricFieldMapping> generated = new ArrayList<MetricFieldMapping>();

    for (String sourceMetricName : sourceMetricNames) {
      MetricFieldMapping mapping = new MetricFieldMapping();
      mapping.setId(buildStableId("mfm", wideTable.getId(), sourceMetricName));
      mapping.setRequirementId(wideTable.getRequirementId());
      mapping.setWideTableId(wideTable.getId());
      mapping.setSourceMetricName(sourceMetricName);
      TargetMatch targetMatch = findBestTarget(sourceMetricName, targets);
      TargetIndicator target = targetMatch != null ? targetMatch.target : null;
      if (target != null) {
        mapping.setTargetIndicatorKey(target.key);
        mapping.setTargetIndicatorName(target.displayName());
        mapping.setMatchType(targetMatch.matchType);
        mapping.setConfidence(targetMatch.confidence);
      } else {
        mapping.setMatchType("manual");
      }
      mapping.setStatus("pending");
      generated.add(mapping);
    }
    if (!generated.isEmpty()) {
      mappingMapper.upsertGenerated(generated);
    }
    return mappingMapper.listByWideTable(wideTable.getId());
  }

  @Transactional
  public MetricFieldMapping updateMapping(
      String wideTableId,
      String mappingId,
      String targetIndicatorKey,
      String targetIndicatorName,
      String matchType,
      String status) {
    if (wideTableId == null || wideTableId.trim().isEmpty() || mappingId == null || mappingId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Wide table id and mapping id are required");
    }
    MetricFieldMapping current = mappingMapper.getByWideTableAndId(wideTableId.trim(), mappingId.trim());
    if (current == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Metric field mapping not found");
    }
    WideTableRecord wideTable = requireWideTable(wideTableId);
    Map<String, TargetIndicator> targets = loadTargetIndicators(wideTable);
    TargetIndicator target = null;
    String normalizedTargetKey = trimToNull(targetIndicatorKey);
    if (normalizedTargetKey != null) {
      target = targets.get(normalizedTargetKey);
      if (target == null) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target indicator key is not in wide table schema");
      }
    }

    current.setTargetIndicatorKey(normalizedTargetKey);
    current.setTargetIndicatorName(
        trimToNull(targetIndicatorName) != null
            ? trimToNull(targetIndicatorName)
            : target != null ? target.displayName() : null);
    current.setMatchType(trimToNull(matchType) != null ? trimToNull(matchType) : "manual");
    current.setConfidence(normalizedTargetKey != null ? new BigDecimal("1.0000") : null);
    current.setStatus(trimToNull(status) != null ? trimToNull(status) : normalizedTargetKey != null ? "confirmed" : "pending");
    mappingMapper.updateMapping(current);
    return mappingMapper.getByWideTableAndId(wideTableId.trim(), mappingId.trim());
  }

  private WideTableRecord requireWideTable(String wideTableId) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Wide table id is required");
    }
    WideTableRecord wideTable = wideTableMapper.getById(wideTableId.trim());
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
    return wideTable;
  }

  private Set<String> extractSourceMetricNames(List<CollectionResult> results) {
    Set<String> out = new LinkedHashSet<String>();
    if (results == null) {
      return out;
    }
    for (CollectionResult result : results) {
      List<Map<String, Object>> rows = parseNormalizedRows(result != null ? result.getNormalizedRowsJson() : null);
      for (Map<String, Object> row : rows) {
        String metricColumn = findMetricNameColumn(row);
        if (metricColumn == null) {
          continue;
        }
        String metricName = trimToNull(asString(row.get(metricColumn)));
        if (metricName != null) {
          out.add(metricName);
        }
      }
    }
    return out;
  }

  private List<Map<String, Object>> parseNormalizedRows(String json) {
    if (json == null || json.trim().isEmpty()) {
      return Collections.emptyList();
    }
    try {
      JsonNode root = objectMapper.readTree(json);
      if (root != null && root.isTextual()) {
        root = objectMapper.readTree(root.asText());
      }
      if (root == null || !root.isArray()) {
        return Collections.emptyList();
      }
      return objectMapper.readValue(objectMapper.writeValueAsString(root), ROW_LIST_REF);
    } catch (Exception ignored) {
      return Collections.emptyList();
    }
  }

  private String findMetricNameColumn(Map<String, Object> row) {
    if (row == null || row.isEmpty()) {
      return null;
    }
    for (String key : row.keySet()) {
      String normalized = key == null ? "" : key.toLowerCase(Locale.ROOT);
      String compact = normalized.replace(" ", "").replace("_", "");
      if (normalized.contains("metric name")
          || compact.contains("metricname")
          || normalized.equals("metric")
          || key.contains("\u6307\u6807\u540d\u79f0")
          || key.contains("\u6307\u6807\u540d")
          || (key.contains("\u6307\u6807") && key.contains("\u540d\u79f0"))) {
        return key;
      }
      if (normalized.contains("metric name") || normalized.equals("metric") || key.contains("指标名称")) {
        return key;
      }
    }
    return null;
  }

  private Map<String, TargetIndicator> loadTargetIndicators(WideTableRecord wideTable) {
    String schemaJson = wideTable != null ? wideTable.getSchemaJson() : null;
    if (schemaJson == null || schemaJson.trim().isEmpty()) {
      return Collections.emptyMap();
    }
    try {
      Map<String, Object> schema = objectMapper.readValue(schemaJson, MAP_REF);
      Object indicators = schema.get("indicator_columns");
      if (!(indicators instanceof List)) {
        indicators = schema.get("columns");
      }
      Map<String, TargetIndicator> out = new LinkedHashMap<String, TargetIndicator>();
      if (indicators instanceof List) {
        for (Object item : (List<?>) indicators) {
          if (!(item instanceof Map)) {
            continue;
          }
          Map<?, ?> raw = (Map<?, ?>) item;
          String role = lower(asString(firstNonNull(raw.get("role"), raw.get("category"))));
          if (schema.get("columns") == indicators && !"indicator".equals(role)) {
            continue;
          }
          String key = trimToNull(asString(firstNonNull(raw.get("key"), raw.get("name"), raw.get("id"))));
          if (key == null) {
            continue;
          }
          TargetIndicator target = new TargetIndicator();
          target.key = key;
          target.name = trimToNull(asString(firstNonNull(raw.get("name"), raw.get("chinese_name"), raw.get("label"))));
          if (target.name == null) {
            target.name = key;
          }
          out.put(key, target);
        }
      }
      enrichTargetColumnComments(wideTable != null ? wideTable.getTableName() : null, out);
      return out;
    } catch (Exception ignored) {
      return Collections.emptyMap();
    }
  }

  private void enrichTargetColumnComments(String tableName, Map<String, TargetIndicator> targets) {
    if (tableName == null || tableName.trim().isEmpty() || targets == null || targets.isEmpty()) {
      return;
    }
    List<TargetTableColumnReadDto> columns = targetTableQueryService.listColumns(tableName.trim());
    if (columns == null || columns.isEmpty()) {
      return;
    }
    for (TargetTableColumnReadDto column : columns) {
      if (column == null || column.getColumnName() == null) {
        continue;
      }
      TargetIndicator target = targets.get(column.getColumnName());
      if (target != null) {
        target.comment = trimToNull(column.getColumnComment());
      }
    }
  }

  private TargetMatch findBestTarget(String sourceMetricName, Map<String, TargetIndicator> targets) {
    String normalizedSource = normalizeForMatch(sourceMetricName);
    TargetMatch best = null;
    for (TargetIndicator target : targets.values()) {
      TargetMatch candidate = scoreTarget(normalizedSource, target);
      if (candidate == null) {
        continue;
      }
      if (best == null || candidate.confidence.compareTo(best.confidence) > 0) {
        best = candidate;
      }
    }
    return best;
  }

  private TargetMatch scoreTarget(String normalizedSource, TargetIndicator target) {
    if (normalizedSource == null || normalizedSource.isEmpty() || target == null) {
      return null;
    }
    String key = normalizeForMatch(target.key);
    String name = normalizeForMatch(target.name);
    String comment = normalizeForMatch(target.comment);
    if (normalizedSource.equals(comment) && !comment.isEmpty()) {
      return new TargetMatch(target, "exact", new BigDecimal("1.0000"));
    }
    if (normalizedSource.equals(name) && !name.isEmpty()) {
      return new TargetMatch(target, "exact", new BigDecimal("0.9800"));
    }
    if (normalizedSource.equals(key) && !key.isEmpty()) {
      return new TargetMatch(target, "exact", new BigDecimal("0.9500"));
    }
    if (!comment.isEmpty() && (comment.contains(normalizedSource) || normalizedSource.contains(comment))) {
      return new TargetMatch(target, "alias", new BigDecimal("0.9000"));
    }
    if (!name.isEmpty() && (name.contains(normalizedSource) || normalizedSource.contains(name))) {
      return new TargetMatch(target, "alias", new BigDecimal("0.8200"));
    }
    return null;
  }

  private String normalizeForMatch(String value) {
    if (value == null) {
      return "";
    }
    return value
        .trim()
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace("（", "(")
        .replace("）", ")")
        .replaceAll("\\([^)]*\\)", "")
        .replaceAll("[：:，,。.;；/\\\\|]+", "")
        .toLowerCase(Locale.ROOT);
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String asString(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private String lower(String value) {
    return value == null ? null : value.toLowerCase(Locale.ROOT);
  }

  private Object firstNonNull(Object... values) {
    if (values == null) {
      return null;
    }
    for (Object value : values) {
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  private String buildStableId(String prefix, String... parts) {
    StringBuilder sb = new StringBuilder(prefix);
    if (parts != null) {
      for (String part : parts) {
        sb.append('|').append(part == null ? "" : part);
      }
    }
    UUID uuid = UUID.nameUUIDFromBytes(sb.toString().getBytes(StandardCharsets.UTF_8));
    return prefix + "_" + uuid.toString();
  }

  private static class TargetIndicator {
    private String key;
    private String name;
    private String comment;

    private String displayName() {
      return comment != null && !comment.trim().isEmpty() ? comment : name;
    }
  }

  private static class TargetMatch {
    private final TargetIndicator target;
    private final String matchType;
    private final BigDecimal confidence;

    private TargetMatch(TargetIndicator target, String matchType, BigDecimal confidence) {
      this.target = target;
      this.matchType = matchType;
      this.confidence = confidence;
    }
  }
}
