export const taskStatusLabel: Record<string, string> = {
  not_started: "未执行",
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  partial: "部分完成",
  invalidated: "已作废",
  queued: "排队中",
  success: "成功",
  failure: "失败",
  timeout: "超时",
};

type TaskStatusPresentation = {
  badgeClassName: string;
  dotClassName: string;
  railFillColor: string;
  panelClassName: string;
};

const DEFAULT_PRESENTATION: TaskStatusPresentation = {
  badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
  dotClassName: "bg-slate-400",
  railFillColor: "#94a3b8",
  panelClassName: "border-slate-200 bg-slate-50/80 text-slate-900",
};

const TASK_STATUS_PRESENTATION: Record<string, TaskStatusPresentation> = {
  not_started: DEFAULT_PRESENTATION,
  pending: {
    badgeClassName: "border-slate-200 bg-white text-slate-700",
    dotClassName: "bg-slate-400",
    railFillColor: "#94a3b8",
    panelClassName: "border-slate-200 bg-slate-50/80 text-slate-900",
  },
  running: {
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    dotClassName: "bg-sky-500",
    railFillColor: "#0ea5e9",
    panelClassName: "border-sky-200 bg-sky-50/80 text-sky-900",
  },
  completed: {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
    railFillColor: "#10b981",
    panelClassName: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
  },
  failed: {
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
    railFillColor: "#f43f5e",
    panelClassName: "border-rose-200 bg-rose-50/80 text-rose-900",
  },
  partial: {
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
    railFillColor: "#f59e0b",
    panelClassName: "border-amber-200 bg-amber-50/80 text-amber-900",
  },
  invalidated: {
    badgeClassName: "border-stone-200 bg-stone-50 text-stone-700",
    dotClassName: "bg-stone-400",
    railFillColor: "#a8a29e",
    panelClassName: "border-stone-200 bg-stone-50/80 text-stone-900",
  },
  queued: DEFAULT_PRESENTATION,
  success: {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
    railFillColor: "#10b981",
    panelClassName: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
  },
  failure: {
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
    railFillColor: "#f43f5e",
    panelClassName: "border-rose-200 bg-rose-50/80 text-rose-900",
  },
  timeout: {
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
    railFillColor: "#f59e0b",
    panelClassName: "border-amber-200 bg-amber-50/80 text-amber-900",
  },
};

const TASK_BLOCK_SURFACES = [
  "bg-white",
  "bg-slate-50/70",
];

export function getTaskStatusBadgeClass(status: string): string {
  return presentationOf(status).badgeClassName;
}

export function getTaskStatusDotClass(status: string): string {
  return presentationOf(status).dotClassName;
}

export function getTaskStatusPanelClass(status: string): string {
  return presentationOf(status).panelClassName;
}

export function getTaskStatusRailFillColor(status: string): string {
  return presentationOf(status).railFillColor;
}

export function getTaskBlockSurfaceClass(index: number): string {
  return TASK_BLOCK_SURFACES[index % TASK_BLOCK_SURFACES.length];
}

function presentationOf(status: string): TaskStatusPresentation {
  return TASK_STATUS_PRESENTATION[status] ?? DEFAULT_PRESENTATION;
}
