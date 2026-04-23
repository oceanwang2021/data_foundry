"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import type {
  BusinessDateFrequency,
  ColumnDefinition,
  Project,
  Requirement,
  SearchEngineProvider,
  TargetTableColumn,
  TargetTableSummary,
  WideTableSchema,
} from "@/lib/types";
import { createRequirement, listTargetTableColumns } from "@/lib/api-client";
import { buildSelectableBusinessDates, formatBusinessDateLabel } from "@/lib/business-date";
import { DEFAULT_RUNTIME_SETTINGS, loadRuntimeSettings } from "@/lib/runtime-settings";
import { cn } from "@/lib/utils";
import SchemaSelectorModal from "@/components/SchemaSelectorModal";

type DimensionDraft = {
  name: string;
  valuesText: string;
};

type Props = {
  project: Project;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (requirement: Requirement) => void;
};

const DEFAULT_SYSTEM_COLUMNS: ColumnDefinition[] = [
  { id: "SYS_BIZ_DATE", name: "SYS_BIZ_DATE", type: "DATE", category: "system", description: "业务归属时间", required: true, isBusinessDate: true },
  { id: "SYS_SCHEDULE_DATE", name: "SYS_SCHEDULE_DATE", type: "DATE", category: "system", description: "调度日期", required: true },
];

function parseCommaLines(text: string): string[] {
  return text
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DEFAULT_SCHEMA: WideTableSchema = { columns: [] };

function resolveWideTableColumnType(
  dataType: string,
  columnType?: string,
): ColumnDefinition["type"] {
  const dt = (dataType ?? "").toLowerCase();
  const ct = (columnType ?? "").toLowerCase();

  if (dt === "tinyint" && ct.includes("(1)")) return "BOOLEAN";
  if (dt === "boolean" || dt === "bool" || dt === "bit") return "BOOLEAN";

  if (
    dt.includes("int")
    || dt === "bigint"
    || dt === "smallint"
    || dt === "mediumint"
    || dt === "tinyint"
  ) {
    return "INTEGER";
  }

  if (
    dt === "decimal"
    || dt === "numeric"
    || dt === "float"
    || dt === "double"
    || dt === "real"
  ) {
    return "NUMBER";
  }

  if (dt.includes("date") || dt.includes("time") || dt === "timestamp" || dt === "datetime") {
    return "DATE";
  }

  return "STRING";
}

function inferWideTableColumnMeta(
  columnName: string,
  columnType: ColumnDefinition["type"],
): Pick<ColumnDefinition, "category" | "isBusinessDate"> {
  const name = (columnName ?? "").trim();
  const lower = name.toLowerCase();

  if (lower === "row_status" || lower === "last_task_id" || lower === "updated_at") {
    return { category: "system" };
  }

  if (lower === "biz_date" || lower === "business_date") {
    return { category: "dimension", isBusinessDate: true };
  }

  if (lower === "id" || lower.endsWith("_id")) {
    return { category: "id" };
  }

  if (columnType === "NUMBER" || columnType === "INTEGER") {
    return { category: "indicator" };
  }

  return { category: "dimension" };
}

function buildColumnsFromTargetTable(columns: TargetTableColumn[]): ColumnDefinition[] {
  const mapped = (columns ?? [])
    .filter((col) => Boolean(col?.columnName))
    .sort((left, right) => (left.ordinalPosition ?? 0) - (right.ordinalPosition ?? 0))
    .map((col) => {
      const type = resolveWideTableColumnType(col.dataType, col.columnType);
      const meta = inferWideTableColumnMeta(col.columnName, type);
      const required = String(col.isNullable ?? "YES").toUpperCase() === "NO";
      const comment = col.columnComment ?? "";
      return {
        id: col.columnName,
        name: col.columnName,
        chineseName: comment || col.columnName,
        type,
        category: meta.category,
        description: comment,
        unit: undefined,
        required,
        isBusinessDate: meta.isBusinessDate,
        passthroughEnabled: false,
        passthroughContent: undefined,
        auditRuleType: undefined,
        auditRuleValue: undefined,
      } satisfies ColumnDefinition;
    });

  if (mapped.length > 0 && !mapped.some((col) => col.category === "id")) {
    mapped[0] = { ...mapped[0], category: "id" };
  }

  return mapped;
}

function BusinessDateInput({
  frequency,
  value,
  onChange,
  disabled,
}: {
  frequency: BusinessDateFrequency;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  if (frequency === "daily" || frequency === "weekly") {
    return (
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border px-3 py-2 text-sm",
          disabled ? "bg-muted/20 text-muted-foreground" : "bg-background",
        )}
      />
    );
  }

  const options = useMemo(() => buildSelectableBusinessDates(frequency).slice().reverse(), [frequency]);

  useEffect(() => {
    if ((!value || !options.includes(value)) && options.length > 0) {
      onChange(options[0]);
    }
  }, [options, value, onChange]);

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-md border px-3 py-2 text-sm",
        disabled ? "bg-muted/20 text-muted-foreground" : "bg-background",
      )}
    >
      {!value ? (
        <option value="">请选择</option>
      ) : null}
      {options.map((d) => (
        <option key={d} value={d}>
          {formatBusinessDateLabel(d, frequency)}
        </option>
      ))}
    </select>
  );
}

export default function CreateRequirementModal({
  project,
  projectId,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const runtimeSettings = useMemo(() => loadRuntimeSettings() ?? DEFAULT_RUNTIME_SETTINGS, []);
  const defaultSearchEngines = runtimeSettings.searchConfig.enabledSearchEngines;

  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [assignee, setAssignee] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [backgroundKnowledge, setBackgroundKnowledge] = useState("");

  const [enabledSearchEngines, setEnabledSearchEngines] = useState<SearchEngineProvider[]>(defaultSearchEngines);
  const [preferredSitesText, setPreferredSitesText] = useState("");

  const [wideTableTitle, setWideTableTitle] = useState("");
  const [wideTableName, setWideTableName] = useState("");
  const [wideTableSchema, setWideTableSchema] = useState<WideTableSchema>(DEFAULT_SCHEMA);
  const [isSchemaSelectorOpen, setIsSchemaSelectorOpen] = useState(false);

  const [bizFrequency, setBizFrequency] = useState<BusinessDateFrequency>("monthly");
  const [bizStart, setBizStart] = useState("");
  const [bizEnd, setBizEnd] = useState("");
  const [endNever, setEndNever] = useState(false);
  const [dimensions, setDimensions] = useState<DimensionDraft[]>([]);

  const [dataUpdateEnabled, setDataUpdateEnabled] = useState<boolean | null>(null);
  const [cronExpression, setCronExpression] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setOwner("");
    setAssignee("");
    setBusinessGoal("");
    setBackgroundKnowledge("");
    setEnabledSearchEngines(defaultSearchEngines);
    setPreferredSitesText(project.dataSource?.search?.sites?.join("\n") ?? "");
    setWideTableTitle("");
    setWideTableName("");
    setWideTableSchema(DEFAULT_SCHEMA);
    setBizFrequency("monthly");
    setBizStart("");
    setBizEnd("");
    setEndNever(false);
    setDimensions([]);
    setDataUpdateEnabled(null);
    setCronExpression("");
    setSaving(false);
    setMessage("");
    setIsSchemaSelectorOpen(false);
  }, [isOpen, defaultSearchEngines, project.dataSource]);

  useEffect(() => {
    if (bizFrequency === "daily" || bizFrequency === "weekly") {
      const today = new Date().toISOString().slice(0, 10);
      setBizStart((prev) => prev || today);
      setBizEnd((prev) => prev || today);
    }
  }, [bizFrequency]);

  if (!isOpen) return null;

  const canSave = title.trim() !== "" && !saving;

  const toggleSearchEngine = (engine: SearchEngineProvider) => {
    setEnabledSearchEngines((prev) => {
      if (prev.includes(engine)) return prev.filter((e) => e !== engine);
      return [...prev, engine];
    });
  };

  const addDimension = () => {
    setDimensions((prev) => [...prev, { name: "", valuesText: "" }]);
  };

  const removeDimension = (idx: number) => {
    setDimensions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateDimension = (idx: number, patch: Partial<DimensionDraft>) => {
    setDimensions((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const handleLinkSchema = async (table: TargetTableSummary) => {
    setMessage("");
    try {
      const rawColumns = await listTargetTableColumns(table.tableName);
      const nextColumns = buildColumnsFromTargetTable(rawColumns);
      setWideTableSchema({ columns: nextColumns });
      setWideTableName(table.tableName);
      setWideTableTitle((prev) => (prev.trim() ? prev : table.tableName));
    } catch (error: any) {
      setMessage(`关联 Schema 失败：${error?.message ?? String(error)}`);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const preferredSites = parseCommaLines(preferredSitesText);
      const projectDataSource = project.dataSource
        ? {
            ...project.dataSource,
            search: {
              ...(project.dataSource.search ?? { engines: [], sites: [], sitePolicy: "preferred" as const }),
              sites: preferredSites,
            },
          }
        : undefined;

      const scope: any = {
        business_date: {
          frequency: bizFrequency,
          start: bizStart || undefined,
          end: endNever ? "never" : (bizEnd || undefined),
          latest_year_quarterly: false,
        },
        dimensions: dimensions
          .filter((d) => d.name.trim() !== "")
          .map((d) => ({
            column_key: d.name.trim(),
            values: parseCommaLines(d.valuesText),
          })),
      };

      const scheduleRules = dataUpdateEnabled === true && cronExpression.trim() !== ""
        ? [{
            id: `SR-${Date.now()}`,
            frequency: bizFrequency,
            trigger_time: cronExpression.trim(),
          }]
        : [];

      const created = await createRequirement(projectId, {
        title: title.trim(),
        owner: owner.trim(),
        assignee: assignee.trim(),
        businessGoal: businessGoal.trim(),
        backgroundKnowledge: backgroundKnowledge.trim(),
        dataUpdateEnabled: dataUpdateEnabled === null ? undefined : dataUpdateEnabled,
        dataUpdateMode: null,
        projectDataSource,
        enabledSearchEngines,
        wideTable: {
          title: wideTableTitle.trim() || `${title.trim()}宽表`,
          tableName: wideTableName.trim() || `wide_table_${Date.now()}`,
          description: "",
          schema: wideTableSchema,
          scope,
          indicatorGroups: [],
          scheduleRules,
          semanticTimeAxis: "business_date",
          collectionCoverageMode: "incremental_by_business_date",
          schemaVersion: 1,
          status: "draft",
        },
      });

      onSaved(created);
      setMessage(`已创建需求：${created.id}`);
      onClose();
    } catch (error: any) {
      setMessage(`创建失败：${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div className="text-lg font-semibold">创建需求</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {message ? <div className={cn("text-sm", message.startsWith("创建失败") ? "text-red-600" : "text-primary")}>{message}</div> : null}

          <section className="rounded-lg border p-4 space-y-3">
            <div className="font-semibold">基本信息</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">需求标题（必填）</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="请输入需求标题"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">关联项目</label>
                <input
                  value={project.name}
                  readOnly
                  className="w-full rounded-md border px-3 py-2 text-sm bg-muted/20 text-muted-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">业务负责人</label>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="例如：业务-张宁"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">执行人</label>
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="例如：算法-陈飞"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <div className="font-semibold">业务需求</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">业务目标</label>
                <textarea
                  value={businessGoal}
                  onChange={(e) => setBusinessGoal(e.target.value)}
                  className="w-full min-h-24 rounded-md border px-3 py-2 text-sm resize-y"
                  placeholder="描述需求背景、目标与交付方式"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">背景知识</label>
                <textarea
                  value={backgroundKnowledge}
                  onChange={(e) => setBackgroundKnowledge(e.target.value)}
                  className="w-full min-h-24 rounded-md border px-3 py-2 text-sm resize-y"
                  placeholder="例如：术语解释、业务口径、参考链接等"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <div className="font-semibold">数据来源</div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">搜索引擎（可选）</div>
              <div className="flex flex-wrap gap-2">
                {(DEFAULT_RUNTIME_SETTINGS.searchConfig.enabledSearchEngines as SearchEngineProvider[]).map((engine) => {
                  const checked = enabledSearchEngines.includes(engine);
                  return (
                    <button
                      type="button"
                      key={engine}
                      onClick={() => toggleSearchEngine(engine)}
                      className={cn(
                        "text-xs px-2 py-1 rounded border",
                        checked ? "bg-primary/10 border-primary/40 text-primary" : "bg-background text-muted-foreground",
                      )}
                    >
                      {engine}
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">优先站点（逗号或换行分隔）</label>
                  <textarea
                    value={preferredSitesText}
                    onChange={(e) => setPreferredSitesText(e.target.value)}
                    className="w-full min-h-24 rounded-md border px-3 py-2 text-sm resize-y"
                    placeholder="例如：example.com, docs.example.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">说明</label>
                  <div className="rounded-md border p-3 text-sm text-muted-foreground bg-muted/10">
                    该部分会写入需求的采集策略（collection_policy）。知识库选择等高级配置可在进入需求详情页后继续完善。
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <div className="font-semibold">表结构定义</div>
            <div className="text-xs text-muted-foreground">
              注：需自行在数据库中创建目标表，后面通过关联 Schema 选择该需求对应的目标表
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">宽表标题</label>
                <input
                  value={wideTableTitle}
                  onChange={(e) => setWideTableTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="例如：ads_autodrive_ops"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">物理表名</label>
                <input
                  value={wideTableName}
                  onChange={(e) => setWideTableName(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="例如：ads_autodrive_ops"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Schema 列数：{wideTableSchema.columns.length}</div>
              <button
                type="button"
                onClick={() => setIsSchemaSelectorOpen(true)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                关联 Schema
              </button>
            </div>
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <div className="font-semibold">数据范围</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">时间粒度</label>
                <select
                  value={bizFrequency}
                  onChange={(e) => setBizFrequency(e.target.value as BusinessDateFrequency)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                >
                  <option value="daily">日</option>
                  <option value="weekly">周</option>
                  <option value="monthly">月</option>
                  <option value="quarterly">季</option>
                  <option value="yearly">年</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">开始时间</label>
                <BusinessDateInput
                  frequency={bizFrequency}
                  value={bizStart}
                  onChange={setBizStart}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">结束时间</label>
                <BusinessDateInput
                  frequency={bizFrequency}
                  value={bizEnd}
                  disabled={endNever}
                  onChange={setBizEnd}
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={endNever} onChange={(e) => setEndNever(e.target.checked)} />
              结束时间为 never（持续更新/开放区间）
            </label>

            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">维度范围</div>
              <button
                type="button"
                onClick={addDimension}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                新增维度
              </button>
            </div>
            {dimensions.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂未配置维度范围。</div>
            ) : (
              <div className="space-y-2">
                {dimensions.map((d, idx) => (
                  <div key={idx} className="rounded-md border p-3 bg-muted/10">
                    <div className="grid gap-2 md:grid-cols-3 items-start">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">维度字段</label>
                        <input
                          value={d.name}
                          onChange={(e) => updateDimension(idx, { name: e.target.value })}
                          className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                          placeholder="例如：company"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs text-muted-foreground">取值（逗号或换行分隔）</label>
                        <textarea
                          value={d.valuesText}
                          onChange={(e) => updateDimension(idx, { valuesText: e.target.value })}
                          className="w-full min-h-20 rounded-md border px-3 py-2 text-sm resize-y"
                          placeholder="例如：Waymo, 滴滴全球"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeDimension(idx)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <div className="font-semibold">数据更新</div>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setDataUpdateEnabled(false)}
                className={cn(
                  "rounded-lg border p-4 text-left",
                  dataUpdateEnabled === false ? "border-primary/50 bg-primary/5" : "bg-background hover:bg-muted/20",
                )}
              >
                <div className="font-medium">一次性交付</div>
                <div className="text-xs text-muted-foreground mt-1">仅交付本次确认范围内的数据。</div>
              </button>
              <button
                type="button"
                onClick={() => setDataUpdateEnabled(true)}
                className={cn(
                  "rounded-lg border p-4 text-left",
                  dataUpdateEnabled === true ? "border-primary/50 bg-primary/5" : "bg-background hover:bg-muted/20",
                )}
              >
                <div className="font-medium">定期更新</div>
                <div className="text-xs text-muted-foreground mt-1">后续仍会持续补齐新增业务周期数据。</div>
              </button>
            </div>

            {dataUpdateEnabled === true ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">调度 Cron（可选）</label>
                <input
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="例如：0 0 3 * * ?"
                />
                <div className="text-[11px] text-muted-foreground">
                  不填写 Cron 也可保存；后续可在需求详情页补充调度规则。
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="p-4 border-t bg-muted/10 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "px-6 py-2 text-sm font-medium rounded-md shadow-sm",
              canSave ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中
              </span>
            ) : (
              "保存"
            )}
          </button>
        </div>
      </div>

      <SchemaSelectorModal
        isOpen={isSchemaSelectorOpen}
        onClose={() => setIsSchemaSelectorOpen(false)}
        currentTableName={wideTableName || undefined}
        onSelect={(table) => {
          void handleLinkSchema(table);
        }}
      />
    </div>
  );
}
