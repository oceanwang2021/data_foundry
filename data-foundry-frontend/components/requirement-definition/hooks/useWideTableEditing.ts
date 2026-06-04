"use client";

import { useEffect, useMemo, useState } from "react";
import { cloneWideTable } from "@/components/requirement-definition/utils/requirementDefinitionUtils";
import { resolveCurrentPlanVersion, resolveRecordPlanVersion } from "@/lib/task-plan-reconciliation";
import type {
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";

type Args = {
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups?: TaskGroup[];
  onWideTablesChange?: (wideTables: WideTable[]) => void;
  onWideTableRecordsChange?: (wideTableRecords: WideTableRecord[]) => void;
};

export function useWideTableEditing({
  wideTables,
  wideTableRecords,
  taskGroups,
  onWideTablesChange,
  onWideTableRecordsChange,
}: Args) {
  const [selectedWtId, setSelectedWtId] = useState<string>(wideTables[0]?.id ?? "");

  const selectedWt = useMemo(
    () => wideTables.find((wt) => wt.id === selectedWtId),
    [wideTables, selectedWtId],
  );

  const selectedWideTableAllRecords = useMemo(
    () => wideTableRecords.filter((record) => record.wideTableId === selectedWtId),
    [wideTableRecords, selectedWtId],
  );

  const selectedWideTablePlanVersion = useMemo(
    () => (
      selectedWt
        ? resolveCurrentPlanVersion(selectedWt, selectedWideTableAllRecords, taskGroups ?? [])
        : 0
    ),
    [selectedWideTableAllRecords, selectedWt, taskGroups],
  );

  const selectedWideTableRecords = useMemo(
    () => {
      if (!selectedWt) {
        return [];
      }
      return selectedWideTableAllRecords.filter(
        (record) => resolveRecordPlanVersion(record, selectedWideTablePlanVersion) === selectedWideTablePlanVersion,
      );
    },
    [selectedWideTableAllRecords, selectedWideTablePlanVersion, selectedWt],
  );

  const handleReplaceWideTables = (nextWideTables: WideTable[]) => {
    if (!onWideTablesChange) {
      return;
    }
    onWideTablesChange(nextWideTables);
  };

  const handleUpdateWideTable = (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => {
    if (!onWideTablesChange) {
      return;
    }

    onWideTablesChange(
      wideTables.map((wt) => (wt.id === wideTableId ? updater(cloneWideTable(wt)) : wt)),
    );
  };

  const handleReplaceWideTableRecords = (wideTableId: string, nextWideTableRecords: WideTableRecord[]) => {
    if (!onWideTableRecordsChange) {
      return;
    }

    const nextPlanVersion = nextWideTableRecords[0]?._metadata?.planVersion;
    onWideTableRecordsChange([
      ...wideTableRecords.filter((record) => {
        if (record.wideTableId !== wideTableId) {
          return true;
        }
        if (nextPlanVersion == null) {
          return false;
        }
        return resolveRecordPlanVersion(record, nextPlanVersion) !== nextPlanVersion;
      }),
      ...nextWideTableRecords,
    ]);
  };

  useEffect(() => {
    if (wideTables.length === 0) {
      if (selectedWtId) {
        setSelectedWtId("");
      }
      return;
    }

    if (!wideTables.some((wt) => wt.id === selectedWtId)) {
      setSelectedWtId(wideTables[0].id);
    }
  }, [wideTables, selectedWtId]);

  return {
    selectedWtId,
    setSelectedWtId,
    selectedWt,
    selectedWideTableAllRecords,
    selectedWideTablePlanVersion,
    selectedWideTableRecords,
    handleReplaceWideTables,
    handleUpdateWideTable,
    handleReplaceWideTableRecords,
  };
}
