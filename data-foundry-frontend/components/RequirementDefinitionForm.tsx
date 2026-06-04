"use client";

import { useMemo, useState } from "react";
import DefinitionActionBar from "@/components/requirement-definition/DefinitionActionBar";
import DefinitionStageNav from "@/components/requirement-definition/DefinitionStageNav";
import { useDefinitionNavigation } from "@/components/requirement-definition/hooks/useDefinitionNavigation";
import { useDefinitionPersistence } from "@/components/requirement-definition/hooks/useDefinitionPersistence";
import { useStepInvalidation } from "@/components/requirement-definition/hooks/useStepInvalidation";
import { useWideTableEditing } from "@/components/requirement-definition/hooks/useWideTableEditing";
import InvalidationDialog from "@/components/requirement-definition/InvalidationDialog";
import BasicInfoSectionView from "@/components/requirement-definition/sections/BasicInfoSection";
import DataSourceSectionView from "@/components/requirement-definition/sections/DataSourceSection";
import DataUpdateSectionView from "@/components/requirement-definition/sections/DataUpdateSection";
import ScopeAndGroupSectionView from "@/components/requirement-definition/sections/ScopeAndGroupSection";
import WideTableSchemaSectionView from "@/components/requirement-definition/sections/WideTableSchemaSection";
import { SectionStatusBadge as SectionStatusBadgeView } from "@/components/requirement-definition/shared/DefinitionShared";
import type { DimensionExcelImportState } from "@/components/requirement-definition/types";
import { deriveDataUpdateSectionStatus } from "@/components/requirement-definition/utils/requirementDefinitionUtils";
import { definitionSectionIds } from "@/lib/requirement-definition-navigation";
import {
  STEP_LABELS,
  buildInvalidationImpactSummary,
  getAffectedSteps,
} from "@/lib/step-status";
import type {
  FetchTask,
  Project,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";

type Props = {
  project: Project;
  requirement: Requirement;
  entryGuide?: string;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups?: TaskGroup[];
  fetchTasks?: FetchTask[];
  onWideTablesChange?: (wideTables: WideTable[]) => void;
  onWideTableRecordsChange?: (wideTableRecords: WideTableRecord[]) => void;
  onTaskGroupsChange?: (taskGroups: TaskGroup[]) => void;
  onFetchTasksChange?: (fetchTasks: FetchTask[]) => void;
  onRequirementChange?: (requirement: Requirement) => void;
  onSubmitRequirement?: (requirement: Requirement) => Promise<void>;
  onProjectChange?: (project: Project) => void;
  onRefreshData?: () => Promise<void>;
};

export default function RequirementDefinitionForm({
  project,
  requirement,
  entryGuide,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  onWideTablesChange,
  onWideTableRecordsChange,
  onTaskGroupsChange,
  onFetchTasksChange,
  onRequirementChange,
  onSubmitRequirement,
  onProjectChange,
  onRefreshData,
}: Props) {
  const {
    selectedWtId,
    setSelectedWtId,
    selectedWt,
    selectedWideTableRecords,
    handleReplaceWideTables,
    handleUpdateWideTable,
    handleReplaceWideTableRecords,
  } = useWideTableEditing({
    wideTables,
    wideTableRecords,
    taskGroups,
    onWideTablesChange,
    onWideTableRecordsChange,
  });

  const visibleDefinitionSectionIds = definitionSectionIds;
  const {
    activeSection,
    activeSectionIndex,
    isNavPinned,
    highlightedSections,
    navFrame,
    navShellRef,
    navRef,
    handleSectionNavigation,
  } = useDefinitionNavigation({
    entryGuide,
    visibleDefinitionSectionIds,
  });

  const {
    stepStatuses,
    setStepStatuses,
    invalidationDialog,
    openInvalidationDialog,
    closeInvalidationDialog,
    confirmInvalidation,
  } = useStepInvalidation({
    wideTables,
    selectedWtId,
    selectedWt,
    requirementStatus: requirement.status,
  });

  const [dimensionExcelImports, setDimensionExcelImports] = useState<
    Record<string, DimensionExcelImportState>
  >({});
  const [scopePreviewDirtyByWideTableId, setScopePreviewDirtyByWideTableId] = useState<Record<string, boolean>>({});

  const dataUpdateStatus = useMemo(
    () => deriveDataUpdateSectionStatus(requirement, selectedWt),
    [requirement, selectedWt],
  );
  const canSubmit = !requirement.schemaLocked && (requirement.status === "draft" || requirement.status === "aligning");
  const submitBlockerMessage = useMemo(() => {
    if (!selectedWt) {
      return "请先关联 Schema 并完成宽表配置。";
    }
    if (stepStatuses.A !== "completed") {
      return "请先在【表结构定义】里关联 Schema，并补齐字段定义后再提交。";
    }
    if (stepStatuses.C !== "completed") {
      return "请先在【数据范围】里补齐时间范围与采集参数表后再提交。";
    }
    if (requirement.dataUpdateEnabled == null) {
      return "请先在【数据更新】里确认是否持续更新后再提交。";
    }
    if (requirement.dataUpdateEnabled === true && !selectedWt.scheduleRule) {
      return "请先在【数据更新】里配置调度规则后再提交。";
    }
    if (dataUpdateStatus !== "completed") {
      return "数据更新配置尚未完成或存在冲突，请先修正后再提交。";
    }
    return "";
  }, [
    dataUpdateStatus,
    requirement.dataUpdateEnabled,
    selectedWt,
    stepStatuses.A,
    stepStatuses.C,
  ]);

  const {
    submitMessage,
    isSavingDefinition,
    isSubmittingDefinition,
    handleSaveDefinition,
    handleSubmitDefinition,
  } = useDefinitionPersistence({
    requirement,
    wideTables,
    wideTableRecords,
    taskGroups,
    fetchTasks,
    selectedWt,
    dimensionExcelImports,
    scopePreviewDirtyByWideTableId,
    setScopePreviewDirtyByWideTableId,
    handleReplaceWideTableRecords,
    onRequirementChange,
    onSubmitRequirement,
    onRefreshData,
    canSubmit,
    submitBlockerMessage,
  });

  const submitDisabledReason = useMemo(() => {
    if (isSavingDefinition) return "正在保存中，请稍后再提交。";
    if (isSubmittingDefinition) return "正在提交中，请稍后。";
    if (!canSubmit) {
      return requirement.schemaLocked ? "需求已提交并锁定，无法再次提交。" : "当前需求状态不支持提交。";
    }
    if (submitBlockerMessage) return submitBlockerMessage;
    return "";
  }, [
    canSubmit,
    isSavingDefinition,
    isSubmittingDefinition,
    requirement.schemaLocked,
    submitBlockerMessage,
  ]);

  return (
    <div className="space-y-4">
      <DefinitionStageNav
        navShellRef={navShellRef}
        navRef={navRef}
        isNavPinned={isNavPinned}
        navFrame={navFrame}
        activeSection={activeSection}
        activeSectionIndex={activeSectionIndex}
        stageCount={visibleDefinitionSectionIds.length}
        onBusinessDefinitionNavigate={handleSectionNavigation("business-definition")}
        onDataSourceNavigate={handleSectionNavigation("data-source")}
        onStructureConfigNavigate={handleSectionNavigation("structure-config")}
        onScopeGenerationNavigate={handleSectionNavigation("scope-generation")}
        onDataUpdateNavigate={handleSectionNavigation("data-update")}
        structureConfigTrailing={<SectionStatusBadgeView label="Schema 定义" status={stepStatuses.A} />}
        scopeGenerationTrailing={<SectionStatusBadgeView label="数据范围" status={stepStatuses.C} />}
        dataUpdateTrailing={<SectionStatusBadgeView label="数据更新配置" status={dataUpdateStatus} />}
      />

      <BasicInfoSectionView
        requirement={requirement}
        wideTables={wideTables}
        onRequirementChange={onRequirementChange}
      />

      <DataSourceSectionView
        project={project}
        requirement={requirement}
        onRequirementChange={onRequirementChange}
      />

      <WideTableSchemaSectionView
        requirementId={requirement.id}
        wideTables={wideTables}
        taskGroups={taskGroups ?? []}
        fetchTasks={fetchTasks ?? []}
        selectedWtId={selectedWtId}
        selectedWt={selectedWt}
        onSelectWt={setSelectedWtId}
        schemaLocked={requirement.schemaLocked}
        onReplaceWideTables={handleReplaceWideTables}
        onUpdateWideTable={handleUpdateWideTable}
        onTaskGroupsChange={onTaskGroupsChange}
        onFetchTasksChange={onFetchTasksChange}
        stepStatuses={stepStatuses}
        onStepStatusesChange={setStepStatuses}
        onShowInvalidationDialog={openInvalidationDialog}
      />

      <ScopeAndGroupSectionView
        requirement={requirement}
        highlightedSections={highlightedSections}
        wideTables={wideTables}
        wideTableRecords={wideTableRecords}
        dimensionExcelImports={dimensionExcelImports}
        onDimensionExcelImportsChange={setDimensionExcelImports}
        scopePreviewDirtyByWideTableId={scopePreviewDirtyByWideTableId}
        onScopePreviewDirtyChange={setScopePreviewDirtyByWideTableId}
        selectedWtId={selectedWtId}
        selectedWt={selectedWt}
        selectedWideTableRecords={selectedWideTableRecords}
        onSelectWt={setSelectedWtId}
        onRequirementChange={onRequirementChange}
        onUpdateWideTable={handleUpdateWideTable}
        onReplaceWideTableRecords={handleReplaceWideTableRecords}
        taskGroups={taskGroups ?? []}
        fetchTasks={fetchTasks ?? []}
        onTaskGroupsChange={onTaskGroupsChange}
        onFetchTasksChange={onFetchTasksChange}
        stepStatuses={stepStatuses}
        onStepStatusesChange={setStepStatuses}
      />

      <DataUpdateSectionView
        requirement={requirement}
        entryGuide={entryGuide}
        highlightedSections={highlightedSections}
        status={dataUpdateStatus}
        selectedWt={selectedWt}
        onRequirementChange={onRequirementChange}
        onUpdateWideTable={handleUpdateWideTable}
      />

      <DefinitionActionBar
        onSave={handleSaveDefinition}
        onSubmit={handleSubmitDefinition}
        saveDisabled={requirement.schemaLocked || isSavingDefinition || isSubmittingDefinition || stepStatuses.A !== "completed"}
        submitDisabled={!canSubmit || Boolean(submitBlockerMessage) || isSavingDefinition || isSubmittingDefinition}
        isSavingDefinition={isSavingDefinition}
        isSubmittingDefinition={isSubmittingDefinition}
        submitDisabledReason={submitDisabledReason}
        submitMessage={submitMessage}
      />

      {invalidationDialog?.open && selectedWt ? (
        <InvalidationDialog
          open={true}
          changedStepLabel={STEP_LABELS[invalidationDialog.changedStep]}
          affectedSteps={getAffectedSteps(stepStatuses, invalidationDialog.changedStep).map((stepId) => ({
            id: stepId,
            label: STEP_LABELS[stepId],
          }))}
          impactSummary={{
            indicatorGroupCount: selectedWt.indicatorGroups.length,
            dimensionValueCount: selectedWt.dimensionRanges.reduce((sum, range) => sum + range.values.length, 0),
            ...buildInvalidationImpactSummary(selectedWt, taskGroups ?? [], fetchTasks ?? []),
          }}
          onConfirm={confirmInvalidation}
          onCancel={closeInvalidationDialog}
        />
      ) : null}
    </div>
  );
}
