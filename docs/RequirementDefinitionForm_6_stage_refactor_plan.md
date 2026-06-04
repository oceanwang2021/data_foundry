# RequirementDefinitionForm.tsx 6阶段重构执行方案

## 一、背景与目标

`RequirementDefinitionForm.tsx` 当前文件体量较大，承担了需求定义页的大量职责，包括：

1. 顶部阶段导航与滚动定位
2. 需求基础信息编辑
3. 数据来源配置
4. Schema 关联与字段维护
5. 数据范围配置
6. Excel/CSV 参数导入
7. SQL 参数预览
8. 数据更新与调度规则配置
9. 保存与提交需求
10. 步骤状态流转与失效确认
11. 预览记录落库与任务计划版本处理

本次重构目标不是一次性重写，而是在控制风险的前提下，将大文件逐步拆分为更清晰的组件、工具函数和 hooks。

最终目标：

```text
RequirementDefinitionForm.tsx：300～600 行
sections 单文件：200～600 行
schema 子组件：100～300 行
scope 子组件：100～400 行
data-update 子组件：100～300 行
hooks 单文件：150～350 行
utils 单文件：100～300 行
```

---

## 二、推荐目录结构

建议最终整理为如下结构：

```text
components/requirement-definition/
  RequirementDefinitionForm.tsx

  DefinitionStageNav.tsx
  DefinitionActionBar.tsx
  InvalidationDialog.tsx

  sections/
    BasicInfoSection.tsx
    DataSourceSection.tsx
    WideTableSchemaSection.tsx
    ScopeAndGroupSection.tsx
    DataUpdateSection.tsx

  schema/
    SchemaTemplateSelector.tsx
    SchemaCandidateList.tsx
    ColumnDefinitionTable.tsx
    ColumnDefinitionRow.tsx
    ColumnCategoryBadge.tsx
    AuditRuleEditor.tsx

  scope/
    BusinessDateRangeEditor.tsx
    DimensionRangeEditor.tsx
    DimensionExcelImportPanel.tsx
    ParameterRowsSqlPanel.tsx
    ScopePreviewPanel.tsx
    WideTableRecordPreviewTable.tsx

  data-update/
    DataUpdateModeSelector.tsx
    IncrementalScheduleRuleEditor.tsx
    FullSnapshotScheduleRuleEditor.tsx
    ScheduleRuleSummary.tsx

  hooks/
    useDefinitionNavigation.ts
    useWideTableEditing.ts
    useDefinitionPersistence.ts
    useStepInvalidation.ts
    useScopePreview.ts
    useDataUpdateConfig.ts

  shared/
    CompactInfoItem.tsx
    CompactChoiceButton.tsx
    EditableField.tsx
    StatusDot.tsx
    SectionStatusBadge.tsx

  utils/
    requirementDefinitionConstants.ts
    requirementDefinitionUtils.ts
    requirementDefinitionFormatters.ts
    schemaTemplateUtils.ts
    scheduleRuleUtils.ts

  types.ts
```

---

## 三、总体执行原则

### 1. 不要一次性重构全部文件

`RequirementDefinitionForm.tsx` 内部存在多个互相关联的核心逻辑：

```text
1. 数据范围预览
2. 任务计划版本
3. 步骤失效确认
4. 数据更新规则
5. 保存提交落库
```

这些逻辑不适合一次性大规模移动。

### 2. 先移动，再抽象

建议顺序为：

```text
先移动类型、常量、纯函数
再拆 UI 组件
最后抽 hooks
```

### 3. 每个阶段都必须可编译、可运行

每完成一个阶段，都应执行：

```bash
npm run lint
npm run build
```

如果项目暂时没有 build 条件，至少执行：

```bash
npm run typecheck
```

或使用项目已有的 TypeScript 检查命令。

---

# 阶段 1：移动类型、常量、纯函数

## 目标

先把文件中的类型、常量、纯函数移动出去。  
这一阶段风险最低，不涉及 JSX 拆分，也不改业务逻辑。

## 建议新增文件

```text
components/requirement-definition/
  types.ts
  utils/
    requirementDefinitionConstants.ts
    requirementDefinitionUtils.ts
    requirementDefinitionFormatters.ts
    schemaTemplateUtils.ts
    scheduleRuleUtils.ts
```

## 建议移动内容

```text
DimensionExcelImportState
SchemaTemplateOption
SchemaTemplateSearchResult
UNLINKED_DATA_TABLE_NAME
MAX_PERSISTED_DIMENSION_ROWS
cloneWideTable
deriveDataUpdateSectionStatus
parseMultilineList
buildDraftWideTable
buildDefaultScheduleRule
fallbackBusinessDateEnd
isTransientDraftWideTable
formatBusinessDateEnd
buildSchemaCandidateMeta
normalizeSchemaTemplateKeyword
resolveSchemaTemplateSearch
filterSchemaTemplateOptions
dedupeSchemaTemplateOptions
compareSchemaCandidatePriority
schemaCandidateStatusScore
frequencyLabel
formatPersistError
normalizeCategoryForUI
categoryBadgeClass
categorySelectClass
groupToneClass
groupSelectClass
categoryLabel
auditRuleNeedsValue
formatPassthroughDisplay
formatAuditRuleDisplay
```

## 给 Codex 的 Prompt

```text
请对 RequirementDefinitionForm.tsx 做第一阶段重构。

目标：
只移动类型、常量和纯函数，不拆 JSX，不抽 hook，不改业务逻辑。

请创建：
- components/requirement-definition/types.ts
- components/requirement-definition/utils/requirementDefinitionConstants.ts
- components/requirement-definition/utils/requirementDefinitionUtils.ts
- components/requirement-definition/utils/requirementDefinitionFormatters.ts
- components/requirement-definition/utils/schemaTemplateUtils.ts
- components/requirement-definition/utils/scheduleRuleUtils.ts

请移动以下内容：
- DimensionExcelImportState
- SchemaTemplateOption
- SchemaTemplateSearchResult
- UNLINKED_DATA_TABLE_NAME
- MAX_PERSISTED_DIMENSION_ROWS
- cloneWideTable
- deriveDataUpdateSectionStatus
- parseMultilineList
- buildDraftWideTable
- buildDefaultScheduleRule
- fallbackBusinessDateEnd
- isTransientDraftWideTable
- formatBusinessDateEnd
- buildSchemaCandidateMeta
- normalizeSchemaTemplateKeyword
- resolveSchemaTemplateSearch
- filterSchemaTemplateOptions
- dedupeSchemaTemplateOptions
- compareSchemaCandidatePriority
- schemaCandidateStatusScore
- frequencyLabel
- formatPersistError
- normalizeCategoryForUI
- categoryBadgeClass
- categorySelectClass
- groupToneClass
- groupSelectClass
- categoryLabel
- auditRuleNeedsValue
- formatPassthroughDisplay
- formatAuditRuleDisplay

要求：
1. 不修改任何函数实现。
2. 不修改 UI。
3. 不修改接口调用。
4. 不修改 className。
5. 不修改中文文案。
6. RequirementDefinitionForm.tsx 通过 import 使用这些函数。
7. 如果某个函数依赖复杂，暂时保留在原文件，并说明原因。
8. 修改后确保 TypeScript 编译通过。
```

## 注意事项

这一阶段不要拆组件。

如果 Codex 想顺手移动下面这些组件，要阻止：

```text
BasicInfoSection
DataSourceSection
WideTableSchemaSection
ScopeAndGroupSection
DataUpdateSection
```

这些组件应留到阶段 3 再处理。

---

# 阶段 2：拆顶部导航、底部操作区、失效确认弹窗

## 目标

拆出主组件中最明显的 UI 外壳：

```text
1. 顶部阶段导航
2. 底部保存 / 提交操作区
3. InvalidationDialog 弹窗
```

## 建议新增文件

```text
components/requirement-definition/
  DefinitionStageNav.tsx
  DefinitionActionBar.tsx
  InvalidationDialog.tsx
```

## 给 Codex 的 Prompt

```text
请对 RequirementDefinitionForm.tsx 做第二阶段重构。

目标：
只拆顶部阶段导航、底部需求操作区、失效确认弹窗，不改业务逻辑。

请新增：
- components/requirement-definition/DefinitionStageNav.tsx
- components/requirement-definition/DefinitionActionBar.tsx
- components/requirement-definition/InvalidationDialog.tsx

要求：
1. DefinitionStageNav 负责渲染 5 个 StageSummaryCard。
2. DefinitionActionBar 负责渲染“保存 / 提交”按钮、submitDisabledReason、submitMessage。
3. InvalidationDialog 从原文件移动到独立文件。
4. 滚动定位逻辑暂时仍保留在 RequirementDefinitionForm.tsx。
5. 保存和提交逻辑仍保留在 RequirementDefinitionForm.tsx。
6. 不修改 className。
7. 不修改中文文案。
8. 不修改按钮 disabled 条件。
9. 不修改任何业务判断。
10. 修改后确保 TypeScript 编译通过。
```

## 注意事项

这一阶段不要抽 `useDefinitionNavigation`。

导航组件只负责展示。  
滚动状态仍由主组件控制，例如：

```text
activeSection
activeSectionIndex
isNavPinned
navFrame
navRef
handleSectionNavigation
```

重点检查：

```text
1. 顶部导航是否正常显示
2. 点击导航是否仍能滚动到对应 section
3. 保存按钮 disabled 条件是否不变
4. 提交按钮 disabled 条件是否不变
5. 失效确认弹窗是否仍能正常打开、确认、取消
```

---

# 阶段 3：移动已有 section 组件

## 目标

把当前文件中已经成型的 section 组件移动出去。

## 建议新增目录

```text
components/requirement-definition/sections/
  BasicInfoSection.tsx
  DataSourceSection.tsx
  WideTableSchemaSection.tsx
  ScopeAndGroupSection.tsx
  DataUpdateSection.tsx
```

## 可选新增 shared 目录

如果多个 section 依赖同样的小组件，可以创建：

```text
components/requirement-definition/shared/
  CompactInfoItem.tsx
  CompactChoiceButton.tsx
  EditableField.tsx
  StatusDot.tsx
  SectionStatusBadge.tsx
```

## 给 Codex 的 Prompt

```text
请对 RequirementDefinitionForm.tsx 做第三阶段重构。

目标：
将已有 section 组件移动到独立文件，不抽 hook，不改业务逻辑。

请创建：
components/requirement-definition/sections/

请移动：
1. BasicInfoSection -> sections/BasicInfoSection.tsx
2. DataSourceSection -> sections/DataSourceSection.tsx
3. WideTableSchemaSection -> sections/WideTableSchemaSection.tsx
4. ScopeAndGroupSection -> sections/ScopeAndGroupSection.tsx
5. DataUpdateSection -> sections/DataUpdateSection.tsx

要求：
1. 只移动组件，不改组件内部逻辑。
2. 所有 props 保持和原逻辑一致。
3. 不修改接口调用。
4. 不修改 className。
5. 不修改中文文案。
6. 不重命名字段。
7. 如果某个 section 依赖同文件里的小组件，可以一起移动到该 section 文件，或者拆到 shared 目录。
8. 修改后确保 TypeScript 编译通过。
```

## 注意事项

这一阶段仍然不抽 hook。  
目标只是让 `RequirementDefinitionForm.tsx` 主文件变短。

重点检查：

```text
1. 基础信息是否还能编辑
2. 数据来源配置是否正常
3. Schema 区域是否正常显示
4. 数据范围区域是否正常显示
5. 数据更新区域是否正常显示
6. 保存 / 提交按钮是否仍能使用
```

如果某个 section 移动后 props 太多，暂时可以接受。  
不要在这个阶段急着优化 props。

---

# 阶段 4：拆 Schema 配置相关组件

## 目标

继续拆 `WideTableSchemaSection` 内部的复杂结构。

## 建议新增目录

```text
components/requirement-definition/schema/
  SchemaTemplateSelector.tsx
  SchemaCandidateList.tsx
  ColumnDefinitionTable.tsx
  ColumnDefinitionRow.tsx
  ColumnCategoryBadge.tsx
  AuditRuleEditor.tsx
```

## 给 Codex 的 Prompt

```text
请对 RequirementDefinitionForm.tsx 的 Schema 配置部分做第四阶段重构。

目标：
拆分 WideTableSchemaSection 内部的 Schema 关联、字段表格、字段编辑、审计规则相关 JSX。

请新增：
- components/requirement-definition/schema/SchemaTemplateSelector.tsx
- components/requirement-definition/schema/SchemaCandidateList.tsx
- components/requirement-definition/schema/ColumnDefinitionTable.tsx
- components/requirement-definition/schema/ColumnDefinitionRow.tsx
- components/requirement-definition/schema/ColumnCategoryBadge.tsx
- components/requirement-definition/schema/AuditRuleEditor.tsx

要求：
1. 只拆组件，不抽 hook。
2. 不修改 Schema 匹配逻辑。
3. 不修改字段分类逻辑。
4. 不修改字段名、字段中文名、字段说明、审计规则的更新逻辑。
5. 不修改 listTargetTableColumns 的调用逻辑。
6. 不修改 shouldConfirmInvalidation、invalidateDownstream、markTaskGroupsAsStale 相关逻辑。
7. 不修改 className。
8. 不修改中文文案。
9. 修改后确保 TypeScript 编译通过。
```

## 注意事项

这一阶段属于中等风险。

不要让 Codex 修改这些核心逻辑：

```text
isStepEditable
shouldConfirmInvalidation
invalidateDownstream
markTaskGroupsAsStale
resolveSchemaTemplateSearch
listTargetTableColumns
updateRequirementWideTable
```

重点检查：

```text
1. 字段分类是否还能正常切换
2. 字段中文名和描述是否还能编辑
3. 审计规则是否还能编辑
4. Schema 关联是否还能正常保存
5. 修改字段后是否还能触发步骤失效确认
6. 已提交锁定状态下是否仍然禁用编辑
```

---

# 阶段 5：拆数据范围和数据更新相关组件

## 目标

拆 `ScopeAndGroupSection` 和 `DataUpdateSection` 内部复杂 JSX。

## 建议新增目录

```text
components/requirement-definition/scope/
  BusinessDateRangeEditor.tsx
  DimensionRangeEditor.tsx
  DimensionExcelImportPanel.tsx
  ParameterRowsSqlPanel.tsx
  ScopePreviewPanel.tsx
  WideTableRecordPreviewTable.tsx

components/requirement-definition/data-update/
  DataUpdateModeSelector.tsx
  IncrementalScheduleRuleEditor.tsx
  FullSnapshotScheduleRuleEditor.tsx
  ScheduleRuleSummary.tsx
```

## 给 Codex 的 Prompt

```text
请对 RequirementDefinitionForm.tsx 的数据范围和数据更新部分做第五阶段重构。

目标：
拆分 ScopeAndGroupSection 和 DataUpdateSection 内部 JSX，不抽 hook，不改业务逻辑。

请新增：
- components/requirement-definition/scope/BusinessDateRangeEditor.tsx
- components/requirement-definition/scope/DimensionRangeEditor.tsx
- components/requirement-definition/scope/DimensionExcelImportPanel.tsx
- components/requirement-definition/scope/ParameterRowsSqlPanel.tsx
- components/requirement-definition/scope/ScopePreviewPanel.tsx
- components/requirement-definition/scope/WideTableRecordPreviewTable.tsx
- components/requirement-definition/data-update/DataUpdateModeSelector.tsx
- components/requirement-definition/data-update/IncrementalScheduleRuleEditor.tsx
- components/requirement-definition/data-update/FullSnapshotScheduleRuleEditor.tsx
- components/requirement-definition/data-update/ScheduleRuleSummary.tsx

要求：
1. 只拆组件，不抽 hook。
2. 不修改 generateWideTablePreviewRecords 的调用逻辑。
3. 不修改 generateWideTablePreviewRecordsFromDimensionRows 的调用逻辑。
4. 不修改 previewParameterRowsSql 的调用逻辑。
5. 不修改 persistWideTablePreview 的调用逻辑。
6. 不修改 reconcileTaskPlanChange 的调用参数。
7. 不修改业务日期范围逻辑。
8. 不修改 Excel/CSV 导入逻辑。
9. 不修改 SQL 参数预览逻辑。
10. 不修改数据更新模式和调度规则判断。
11. 不修改 className。
12. 不修改中文文案。
13. 修改后确保 TypeScript 编译通过。
```

## 注意事项

这一阶段风险较高，因为数据范围会影响后续任务计划和预览记录。

不要让 Codex 修改这些核心逻辑：

```text
generateWideTablePreviewRecords
generateWideTablePreviewRecordsFromDimensionRows
previewParameterRowsSql
persistWideTablePreview
reconcileTaskPlanChange
resolveCurrentPlanVersion
resolveRecordPlanVersion
```

重点检查：

```text
1. 手动维度值输入是否正常
2. Excel/CSV 参数导入是否正常
3. SQL 参数预览是否正常
4. 保存后 wideTableRecords 是否正常更新
5. 数据更新模式切换是否正常
6. 增量更新必须有业务日期列的限制是否仍然生效
7. 全量快照调度规则展示是否正常
```

---

# 阶段 6：抽取核心 hooks

## 目标

最后再抽 hooks。  
前 5 个阶段主要是移动和拆组件，第 6 阶段才开始整理状态逻辑。

## 建议新增目录

```text
components/requirement-definition/hooks/
  useDefinitionNavigation.ts
  useWideTableEditing.ts
  useDefinitionPersistence.ts
  useStepInvalidation.ts
  useScopePreview.ts
  useDataUpdateConfig.ts
```

## 推荐拆分顺序

虽然整体叫阶段 6，但实际执行时建议分 3 次：

```text
6.1 先抽 useDefinitionNavigation、useWideTableEditing
6.2 再抽 useDefinitionPersistence、useStepInvalidation
6.3 最后抽 useScopePreview、useDataUpdateConfig
```

## 给 Codex 的 Prompt

```text
请对 RequirementDefinitionForm.tsx 做第六阶段重构，抽取核心 hooks。

请按顺序抽取，不要一次性全部抽完：

第一步：
抽取 useDefinitionNavigation.ts
负责：
- activeSection
- isNavPinned
- highlightedSections
- navFrame
- navShellRef
- navRef
- scrollToSection
- handleSectionNavigation
- hashchange 监听
- entryGuide 定位逻辑

第二步：
抽取 useWideTableEditing.ts
负责：
- selectedWtId
- selectedWt
- selectedWideTableAllRecords
- selectedWideTablePlanVersion
- selectedWideTableRecords
- handleReplaceWideTables
- handleUpdateWideTable
- handleReplaceWideTableRecords

第三步：
抽取 useDefinitionPersistence.ts
负责：
- persistDefinition
- handleSaveDefinition
- handleSubmitDefinition
- submitMessage
- isSavingDefinition
- isSubmittingDefinition
- submitDisabledReason

第四步：
抽取 useStepInvalidation.ts
负责：
- stepStatuses
- invalidationDialog
- setInvalidationDialog
- 步骤状态刷新
- 下游步骤失效确认

第五步：
抽取 useScopePreview.ts
负责：
- dimensionExcelImports
- scopePreviewDirtyByWideTableId
- 预览记录生成相关状态

第六步：
抽取 useDataUpdateConfig.ts
负责：
- dataUpdateStatus
- 数据更新模式判断
- 调度规则编辑相关逻辑

要求：
1. 每次只抽一个 hook。
2. 不改变 persistDefinition 的行为。
3. 不改变 handleSaveDefinition 的行为。
4. 不改变 handleSubmitDefinition 的行为。
5. 不改变 reconcileTaskPlanChange 的调用参数。
6. 不改变 persistWideTablePreview 的调用参数。
7. 不改变 stepStatuses 的失效逻辑。
8. 不改变滚动导航表现。
9. 不修改 className。
10. 不修改中文文案。
11. 每抽完一个 hook 都要确保 TypeScript 编译通过。
```

## 注意事项

这一阶段不要让 Codex 一次性抽完 6 个 hooks。

建议分批执行：

### 6.1 导航和宽表编辑

重点检查：

```text
1. 页面进入时 hash 定位是否正常
2. 点击顶部导航是否正常滚动
3. entryGuide === "production-scope" 时是否仍能跳转并高亮
4. 宽表切换是否正常
5. selectedWt 是否正确更新
```

### 6.2 保存提交和步骤失效

重点检查：

```text
1. 保存是否仍能落库
2. 提交是否仍会锁定 schema
3. submitMessage 是否正常显示
4. 修改上游步骤后是否仍会提示下游失效
5. 失效确认后任务组是否仍会被标记 stale
```

### 6.3 数据范围和数据更新

重点检查：

```text
1. Excel/CSV 导入状态是否正常
2. scopePreviewDirtyByWideTableId 是否正常清理
3. 数据更新状态是否正确
4. 调度规则修改是否正确写回 wideTable
```

---

## 四、推荐实际执行节奏

文档上是 6 个阶段，但 Codex 实际执行建议为 8 次左右：

```text
第 1 次执行：阶段 1
第 2 次执行：阶段 2
第 3 次执行：阶段 3
第 4 次执行：阶段 4
第 5 次执行：阶段 5
第 6 次执行：阶段 6.1
第 7 次执行：阶段 6.2
第 8 次执行：阶段 6.3
```

这样比 13 个阶段更紧凑，同时又不会把高风险逻辑一次性拆太多。

---

## 五、不建议压缩到 3～4 个阶段的原因

虽然可以简单压成：

```text
1. 工具函数
2. UI 组件
3. hooks
4. 清理
```

但对 `RequirementDefinitionForm.tsx` 来说风险偏高。原因是文件中存在多个强耦合逻辑：

```text
1. 数据范围预览会影响 wideTableRecords
2. wideTableRecords 会影响任务计划版本
3. 任务计划版本会影响任务组失效
4. Schema 修改会触发下游步骤失效确认
5. 数据更新模式会依赖业务日期列
6. 保存和提交会统一触发预览、落库、状态锁定
```

因此，6 个阶段是更稳妥的压缩版本。

---

## 六、每阶段通用检查清单

每个阶段完成后，都建议检查：

```text
1. npm run lint 是否通过
2. npm run build 或 typecheck 是否通过
3. 页面是否能正常打开
4. 顶部导航是否正常
5. 保存按钮是否正常
6. 提交按钮是否正常
7. 已提交需求是否仍然锁定编辑
8. 修改 Schema 后是否会触发失效确认
9. 数据范围预览是否正常
10. 数据更新配置是否正常
```

---

## 七、给 Codex 的总控 Prompt

如果希望 Codex 先理解整体任务，可以先输入：

```text
当前 RequirementDefinitionForm.tsx 文件过大，请按 6 个阶段重构。

总原则：
1. 不一次性重构全部文件。
2. 先移动类型、常量、纯函数。
3. 再拆 UI 组件。
4. 最后抽 hooks。
5. 每个阶段都必须保证 TypeScript 编译通过。
6. 不允许修改业务逻辑。
7. 不允许修改接口调用。
8. 不允许修改字段名。
9. 不允许修改 className。
10. 不允许修改中文文案。
11. 如果某段逻辑依赖复杂，先保留在原文件，并说明原因。

请先执行阶段 1，不要提前执行后续阶段。
```

---

## 八、最终建议

推荐采用：

```text
6 个文档阶段
8 次 Codex 实际执行
每次执行后手动检查页面和 TypeScript 编译
```

不要追求一次性把文件拆到最优。  
对于这种强业务耦合的前端大文件，**可运行、可回滚、每次改动边界清晰**比拆得彻底更重要。
