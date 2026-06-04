"use client";

import RequirementDataProcessingPanel from "@/components/RequirementDataProcessingPanel";
import type { ScheduleJob } from "@/lib/domain";
import type {
  FetchTask,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";

type Props = {
  requirement: Requirement;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
  onRequirementChange?: (requirement: Requirement) => void;
  onRefreshData?: () => void | Promise<void>;
};

export default function TaskOutputTab({
  requirement,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  scheduleJobs,
  onRequirementChange,
  onRefreshData,
}: Props) {
  return (
    <RequirementDataProcessingPanel
      requirement={requirement}
      wideTables={wideTables}
      wideTableRecords={wideTableRecords}
      taskGroups={taskGroups}
      fetchTasks={fetchTasks}
      scheduleJobs={scheduleJobs}
      onRequirementChange={onRequirementChange}
      onRefreshData={onRefreshData ? async () => { await onRefreshData(); } : undefined}
    />
  );
}
