package com.huatai.datafoundry.backend.requirement.domain.repository;

import com.huatai.datafoundry.backend.requirement.domain.model.Requirement;
import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import java.util.List;

public interface RequirementRepository {
  List<Requirement> listByProject(String projectId);

  Requirement getByProjectAndId(String projectId, String requirementId);

  Requirement getById(String requirementId);

  int insertRequirement(Requirement requirement);

  int updateRequirementByProjectAndId(Requirement requirementPatch);

  WideTable getPrimaryWideTableByRequirement(String requirementId);

  List<WideTable> listPrimaryWideTablesByRequirementIds(List<String> requirementIds);

  WideTable getWideTableByIdForRequirement(String requirementId, String wideTableId);

  int insertWideTable(WideTable wideTable);

  int updateWideTableByIdAndRequirement(WideTable wideTablePatch);
}
