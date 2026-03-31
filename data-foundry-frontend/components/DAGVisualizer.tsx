import { CheckCircle2, Circle, ArrowRight, Loader2, FileInput, Bot, Scan, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
// DAG 执行步骤类型，仅用于本组件的可视化流程
type ExecutionStep = "init" | "collection" | "pre_audit" | "audit" | "acceptance";

interface DAGProps {
  currentStep: ExecutionStep; // The actual progress of the task
  viewingStep: ExecutionStep; // The step the user is currently looking at
  onStepClick: (step: ExecutionStep) => void;
}

const STEPS: { id: ExecutionStep; label: string; icon?: any }[] = [
  { id: "init", label: "范围定义", icon: FileInput },
  { id: "collection", label: "数据采集" },
  { id: "pre_audit", label: "自动预审", icon: Bot },
  { id: "audit", label: "人工审核" },
  { id: "acceptance", label: "业务验收", icon: Flag },
];

export default function DAGVisualizer({ currentStep, viewingStep, onStepClick }: DAGProps) {
  // Helper to determine status of a step relative to current progress
  const getStepStatus = (stepId: ExecutionStep) => {
    const stepIndex = STEPS.findIndex((s) => s.id === stepId);
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  return (
    <div className="flex items-center space-x-4 py-6">
      {STEPS.map((step, index) => {
        const status = getStepStatus(step.id);
        const isViewing = viewingStep === step.id;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            {/* Node */}
            <button
              onClick={() => onStepClick(step.id)}
              disabled={status === "pending"}
              className={cn(
                "group relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                // Status styles
                status === "completed" && "bg-muted/50 text-muted-foreground hover:bg-muted",
                status === "active" && "border-primary bg-primary/5 text-primary",
                status === "pending" && "opacity-50 cursor-not-allowed",
                // Viewing Highlight
                isViewing && "ring-2 ring-primary ring-offset-2 border-primary"
              )}
            >
              <div className="flex items-center gap-2">
                {status === "completed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                {status === "active" && <Loader2 className="h-5 w-5 animate-spin" />}
                {status === "pending" && <Circle className="h-5 w-5" />}
                <span className="font-semibold">{step.label}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {status === "completed" ? "已完成" : status === "active" ? "进行中" : "待开始"}
              </div>
            </button>

            {/* Connector */}
            {index < STEPS.length - 1 && (
              <div className="px-4 text-muted-foreground/30">
                <ArrowRight className="h-6 w-6" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}