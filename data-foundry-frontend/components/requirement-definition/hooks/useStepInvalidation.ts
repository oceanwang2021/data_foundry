"use client";

import { useEffect, useState } from "react";
import {
  type StepId,
  type StepStatusMap,
  deriveStepStatus,
  initStepStatus,
  invalidateDownstream,
} from "@/lib/step-status";
import type { WideTable } from "@/lib/types";

type InvalidationDialogState = {
  open: boolean;
  changedStep: StepId;
  onConfirm: () => void;
} | null;

type Args = {
  wideTables: WideTable[];
  selectedWtId: string;
  selectedWt?: WideTable;
  requirementStatus: string;
};

export function useStepInvalidation({
  wideTables,
  selectedWtId,
  selectedWt,
  requirementStatus,
}: Args) {
  const [stepStatuses, setStepStatuses] = useState<StepStatusMap>(() => {
    const wt = wideTables.find((wideTable) => wideTable.id === (wideTables[0]?.id ?? ""));
    return wt ? deriveStepStatus(wt) : initStepStatus();
  });
  const [invalidationDialog, setInvalidationDialog] = useState<InvalidationDialogState>(null);

  useEffect(() => {
    const wt = wideTables.find((wideTable) => wideTable.id === selectedWtId);
    setStepStatuses(wt ? deriveStepStatus(wt) : initStepStatus());
  }, [selectedWtId, wideTables]);

  useEffect(() => {
    if (
      requirementStatus !== "aligning"
      || !selectedWt
      || selectedWt.businessDateRange.end !== "never"
    ) {
      return;
    }

    setStepStatuses((current) => (
      current.D === "completed" ? invalidateDownstream(current, "C") : current
    ));
  }, [requirementStatus, selectedWt?.businessDateRange.end, selectedWt?.id]);

  const openInvalidationDialog = (changedStep: StepId, onConfirm: () => void) => {
    setInvalidationDialog({ open: true, changedStep, onConfirm });
  };

  const closeInvalidationDialog = () => {
    setInvalidationDialog(null);
  };

  const confirmInvalidation = () => {
    if (!invalidationDialog) {
      return;
    }
    invalidationDialog.onConfirm();
    setInvalidationDialog(null);
  };

  return {
    stepStatuses,
    setStepStatuses,
    invalidationDialog,
    openInvalidationDialog,
    closeInvalidationDialog,
    confirmInvalidation,
  };
}
