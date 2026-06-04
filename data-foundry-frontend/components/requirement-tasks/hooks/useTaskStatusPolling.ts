"use client";

import { useEffect } from "react";
import { syncWideTableCollectionStatuses } from "@/lib/api-client";
import type { WideTable } from "@/lib/types";

type Props = {
  selectedWt?: WideTable;
  activeTaskSubTab: "prompts" | "tasks" | "output";
  hasRunningCollectionInstances: boolean;
  onRefreshData?: () => Promise<void>;
};

export default function useTaskStatusPolling({
  selectedWt,
  activeTaskSubTab,
  hasRunningCollectionInstances,
  onRefreshData,
}: Props) {
  useEffect(() => {
    if (!selectedWt || activeTaskSubTab !== "tasks" || !hasRunningCollectionInstances || !onRefreshData) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const sync = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        await syncWideTableCollectionStatuses(selectedWt.id);
        if (!cancelled) {
          await onRefreshData();
        }
      } catch {
        // Keep the page interactive even if downstream status sync is temporarily unavailable.
      } finally {
        inFlight = false;
      }
    };

    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTaskSubTab, hasRunningCollectionInstances, onRefreshData, selectedWt]);
}
