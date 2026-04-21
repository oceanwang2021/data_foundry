package com.huatai.datafoundry.backend.task.domain.repository;

import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;

/**
 * Read-only repository port for task planning.
 *
 * <p>WideTable is owned by requirement context. Task context reads it for plan generation.</p>
 */
public interface WideTableReadRepository {
  WideTablePlanSource getPrimaryByRequirement(String requirementId);

  WideTablePlanSource getByIdForRequirement(String requirementId, String wideTableId);
}
