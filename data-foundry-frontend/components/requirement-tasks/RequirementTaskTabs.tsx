import { StageSummaryCard } from "@/components/StageSummaryCard";
import { cn } from "@/lib/utils";

type TaskSubTabKey = "prompts" | "tasks" | "output";

type TaskSubTabView = {
  key: TaskSubTabKey;
  label: string;
  description: string;
};

type Props = {
  activeTaskSubTab: TaskSubTabKey;
  activeTaskSubTabIndex: number;
  taskSubTabs: TaskSubTabView[];
  onSelect: (tabKey: TaskSubTabKey) => void;
};

export default function RequirementTaskTabs({
  activeTaskSubTab,
  activeTaskSubTabIndex,
  taskSubTabs,
  onSelect,
}: Props) {
  return (
    <nav
      aria-label="任务页面导航"
      className={cn(
        "relative z-20 grid overflow-hidden rounded-xl border border-border/80 bg-background/98 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-background/92",
        "grid-cols-3",
      )}
    >
      {taskSubTabs.map((tab, index) => (
        <StageSummaryCard
          key={tab.key}
          href={`#task-${tab.key}`}
          index={index + 1}
          title={tab.label}
          description={tab.description}
          isActive={activeTaskSubTab === tab.key}
          onNavigate={(event) => {
            event.preventDefault();
            onSelect(tab.key);
          }}
        />
      ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-border/80">
        <div
          className="h-full bg-primary transition-transform duration-200 ease-out"
          style={{
            width: `${100 / taskSubTabs.length}%`,
            transform: `translateX(${activeTaskSubTabIndex * 100}%)`,
          }}
        />
      </div>
    </nav>
  );
}
