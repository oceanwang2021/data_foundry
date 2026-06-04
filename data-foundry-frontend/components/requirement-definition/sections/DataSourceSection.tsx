"use client";

import { useEffect, useMemo, useState } from "react";
import KnowledgeBaseSelectorModal from "@/components/KnowledgeBaseSelectorModal";
import { buildApiUrl } from "@/lib/api-base";
import { fetchRuntimeSettings } from "@/lib/api-client";
import { DEFAULT_RUNTIME_SETTINGS, formatSearchEngineLabel } from "@/lib/runtime-settings";
import type {
  KnowledgeBase,
  Project,
  Requirement,
} from "@/lib/types";
import { parseMultilineList } from "@/components/requirement-definition/utils/requirementDefinitionUtils";

type Props = {
  project: Project;
  requirement: Requirement;
  onRequirementChange?: (requirement: Requirement) => void;
};

export default function DataSourceSection({
  project,
  requirement,
  onRequirementChange,
}: Props) {
  const [isKnowledgeBaseSelectorOpen, setKnowledgeBaseSelectorOpen] = useState(false);
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [enabledSearchEngines, setEnabledSearchEngines] = useState(
    DEFAULT_RUNTIME_SETTINGS.searchConfig.enabledSearchEngines,
  );

  useEffect(() => {
    fetch(buildApiUrl("/api/knowledge-bases"))
      .then((res) => res.json())
      .then((data) =>
        setAllKnowledgeBases(
          data.map((item: any) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? "",
            documentCount: item.document_count ?? 0,
            status: item.status ?? "ready",
            lastUpdated: item.last_updated ?? "",
          })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRuntimeSettings()
      .then((settings) => setEnabledSearchEngines(settings.searchConfig.enabledSearchEngines))
      .catch(() => {});
  }, []);

  const knowledgeBaseNameMap = useMemo(
    () => new Map(allKnowledgeBases.map((item) => [item.id, item.name])),
    [allKnowledgeBases],
  );

  const effectiveCollectionPolicy: NonNullable<Requirement["collectionPolicy"]> = useMemo(() => {
    if (requirement.collectionPolicy) {
      const normalizedEngines = requirement.collectionPolicy.searchEngines?.length
        ? requirement.collectionPolicy.searchEngines
        : enabledSearchEngines;
      return {
        ...requirement.collectionPolicy,
        searchEngines: normalizedEngines,
      };
    }

    return {
      searchEngines: enabledSearchEngines,
      preferredSites: project.dataSource.search.sites ?? [],
      sitePolicy: project.dataSource.search.sitePolicy ?? "preferred",
      knowledgeBases: project.dataSource.knowledgeBases ?? [],
      nullPolicy: "",
      sourcePriority: "",
      valueFormat: "",
    };
  }, [enabledSearchEngines, project.dataSource, requirement.collectionPolicy]);

  const updateRequirementCollectionPolicy = (
    updater: (policy: NonNullable<Requirement["collectionPolicy"]>) => NonNullable<Requirement["collectionPolicy"]>,
  ) => {
    onRequirementChange?.({
      ...requirement,
      collectionPolicy: updater(effectiveCollectionPolicy),
      updatedAt: new Date().toISOString(),
    });
  };

  const blockClass = "space-y-3 rounded-lg bg-muted/10 p-4";

  return (
    <section id="data-source" className="scroll-mt-28 rounded-xl border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold">2. 数据来源</h3>
        <p className="text-xs text-muted-foreground">这里修改的是需求级来源策略（唯一真源：requirements.collection_policy）。</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={blockClass}>
          <div>
            <h4 className="text-sm font-semibold">搜索引擎</h4>
            <p className="mt-1 text-xs text-muted-foreground">引擎启用列表已迁移到系统设置，这里只维护项目级站点策略。</p>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">全局启用引擎</div>
            {enabledSearchEngines.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                当前未启用搜索引擎，请前往【设置】页面统一配置。              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {enabledSearchEngines.map((engine) => (
                  <span
                    key={engine}
                    className="inline-flex items-center rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary"
                  >
                    {formatSearchEngineLabel(engine)}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              引擎列表在“设置 &gt; 搜索引擎与接入”中统一维护。            </div>
          </div>
          <label className="space-y-1 block">
            <div className="text-xs font-medium text-muted-foreground">站点策略</div>
            <select
              value={effectiveCollectionPolicy.sitePolicy}
              onChange={(event) =>
                updateRequirementCollectionPolicy((currentPolicy) => ({
                  ...currentPolicy,
                  sitePolicy: event.target.value as NonNullable<Requirement["collectionPolicy"]>["sitePolicy"],
                  searchEngines: enabledSearchEngines,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="preferred">preferred</option>
              <option value="whitelist">whitelist</option>
            </select>
          </label>
          <label className="space-y-1 block">
            <div className="text-xs font-medium text-muted-foreground">站点范围</div>
            <textarea
              value={(effectiveCollectionPolicy.preferredSites ?? []).join("\n")}
              onChange={(event) =>
                updateRequirementCollectionPolicy((currentPolicy) => ({
                  ...currentPolicy,
                  preferredSites: parseMultilineList(event.target.value),
                  searchEngines: enabledSearchEngines,
                }))
              }
              className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="每行一个 site:xxx 或 URL"
            />
          </label>
        </div>

        <div className={blockClass}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">知识库</h4>
              <p className="mt-1 text-xs text-muted-foreground">补充项目内部沉淀资料。</p>
            </div>
            <button
              type="button"
              onClick={() => setKnowledgeBaseSelectorOpen(true)}
              className="rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
            >
              选择知识库            </button>
          </div>
          {(effectiveCollectionPolicy.knowledgeBases ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              暂未关联知识库            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(effectiveCollectionPolicy.knowledgeBases ?? []).map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded-full border bg-background px-2 py-1 text-xs text-foreground"
                >
                  {knowledgeBaseNameMap.get(id) ?? id}
                </span>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            已关联 {(effectiveCollectionPolicy.knowledgeBases ?? []).length} 个知识库
          </div>
        </div>

      </div>

      <div className="rounded-lg bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
        当前需求使用 {enabledSearchEngines.length} 个全局搜索引擎，关联 {(effectiveCollectionPolicy.knowledgeBases ?? []).length} 个知识库。
      </div>

      <KnowledgeBaseSelectorModal
        isOpen={isKnowledgeBaseSelectorOpen}
        onClose={() => setKnowledgeBaseSelectorOpen(false)}
        allKnowledgeBases={allKnowledgeBases}
        linkedIds={effectiveCollectionPolicy.knowledgeBases ?? []}
        onSave={(ids) =>
          updateRequirementCollectionPolicy((currentPolicy) => ({
            ...currentPolicy,
            knowledgeBases: ids,
            searchEngines: enabledSearchEngines,
          }))
        }
      />
    </section>
  );
}
