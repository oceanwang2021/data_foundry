export const MAX_BATCH_EXECUTION_CONCURRENCY = 5;

export const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "初始补数",
  manual: "手动执行",
  manual_retry: "手动重试",
  trial: "试运行",
};

export const DEFAULT_INDICATOR_GROUP_PREFIX = "ig_default_";

export const GROUP_TONE_CLASSES = [
  "border-sky-200 bg-sky-50 text-sky-700",
  "border-emerald-200 bg-emerald-50 text-emerald-700",
  "border-orange-200 bg-orange-50 text-orange-700",
  "border-rose-200 bg-rose-50 text-rose-700",
  "border-violet-200 bg-violet-50 text-violet-700",
  "border-cyan-200 bg-cyan-50 text-cyan-700",
];
