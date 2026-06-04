"use client";

import type { MouseEvent, ReactNode, Ref } from "react";
import { StageSummaryCard } from "@/components/StageSummaryCard";
import { cn } from "@/lib/utils";
import type { DefinitionSectionId } from "@/lib/requirement-definition-navigation";

type Props = {
  navShellRef: Ref<HTMLDivElement>;
  navRef: Ref<HTMLElement>;
  isNavPinned: boolean;
  navFrame: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  activeSection: DefinitionSectionId;
  activeSectionIndex: number;
  stageCount: number;
  onBusinessDefinitionNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onDataSourceNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onStructureConfigNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onScopeGenerationNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onDataUpdateNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  structureConfigTrailing?: ReactNode;
  scopeGenerationTrailing?: ReactNode;
  dataUpdateTrailing?: ReactNode;
};

export default function DefinitionStageNav({
  navShellRef,
  navRef,
  isNavPinned,
  navFrame,
  activeSection,
  activeSectionIndex,
  stageCount,
  onBusinessDefinitionNavigate,
  onDataSourceNavigate,
  onStructureConfigNavigate,
  onScopeGenerationNavigate,
  onDataUpdateNavigate,
  structureConfigTrailing,
  scopeGenerationTrailing,
  dataUpdateTrailing,
}: Props) {
  return (
    <div
      ref={navShellRef}
      style={isNavPinned ? { height: navFrame.height } : undefined}
    >
      <nav
        ref={navRef}
        aria-label="需求页面导航"
        className={cn(
          "relative z-20 grid overflow-hidden rounded-xl border border-border/80 bg-background/98 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-background/92",
          "grid-cols-5",
          isNavPinned ? "fixed" : "relative",
        )}
        style={isNavPinned ? { top: navFrame.top, left: navFrame.left, width: navFrame.width } : undefined}
      >
        <StageSummaryCard
          href="#business-definition"
          index={1}
          title="业务需求"
          description="查看需求背景和角色分工。"
          isActive={activeSection === "business-definition"}
          onNavigate={onBusinessDefinitionNavigate}
        />
        <StageSummaryCard
          href="#data-source"
          index={2}
          title="数据来源"
          description="维护项目级检索引擎和知识库。"
          isActive={activeSection === "data-source"}
          onNavigate={onDataSourceNavigate}
        />
        <StageSummaryCard
          href="#structure-config"
          index={3}
          title="表结构定义"
          description="关联 Schema，并维护字段元数据。"
          isActive={activeSection === "structure-config"}
          onNavigate={onStructureConfigNavigate}
          trailing={structureConfigTrailing}
        />
        <StageSummaryCard
          href="#scope-generation"
          index={4}
          title="数据范围"
          description="配置范围，预览可选。"
          isActive={activeSection === "scope-generation"}
          onNavigate={onScopeGenerationNavigate}
          trailing={scopeGenerationTrailing}
        />
        <StageSummaryCard
          href="#data-update"
          index={5}
          title="数据更新"
          description="确认是否持续更新，以及更新方式。"
          isActive={activeSection === "data-update"}
          onNavigate={onDataUpdateNavigate}
          trailing={dataUpdateTrailing}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-border/80">
          <div
            className="h-full bg-primary transition-transform duration-200 ease-out"
            style={{
              width: `${100 / stageCount}%`,
              transform: `translateX(${activeSectionIndex * 100}%)`,
            }}
          />
        </div>
      </nav>
    </div>
  );
}
