"use client";

import { useEffect, useState } from "react";
import type { WideTable } from "@/lib/types";

type Props = {
  selectedWt?: WideTable;
  usesBusinessDateAxis: boolean;
  trialAvailableBusinessDates: string[];
  trialParameterRows: Array<{ rowKey: string }>;
  trialMaxRowsDefault?: number;
};

export default function useTrialRun({
  selectedWt,
  usesBusinessDateAxis,
  trialAvailableBusinessDates,
  trialParameterRows,
  trialMaxRowsDefault = 20,
}: Props) {
  const [trialBusinessDates, setTrialBusinessDates] = useState<string[]>([]);
  const [selectedTrialParameterRowKeys, setSelectedTrialParameterRowKeys] = useState<string[]>([]);
  const [trialMaxRows, setTrialMaxRows] = useState(trialMaxRowsDefault);
  const [trialRunMessage, setTrialRunMessage] = useState("");
  const [isStartingTrialRun, setIsStartingTrialRun] = useState(false);
  const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
  const [isTrialTaskListExpanded, setIsTrialTaskListExpanded] = useState(true);

  useEffect(() => {
    setIsTrialTaskListExpanded(true);
    setTrialRunMessage("");
    setSelectedTrialParameterRowKeys([]);
  }, [selectedWt?.id]);

  useEffect(() => {
    if (!usesBusinessDateAxis) {
      setTrialBusinessDates([]);
      return;
    }
    setTrialBusinessDates((current) => {
      const retained = current.filter((item) => trialAvailableBusinessDates.includes(item));
      if (retained.length > 0) {
        return retained;
      }
      return trialAvailableBusinessDates[0] ? [trialAvailableBusinessDates[0]] : [];
    });
  }, [trialAvailableBusinessDates, usesBusinessDateAxis]);

  useEffect(() => {
    const availableRowKeys = new Set(trialParameterRows.map((row) => row.rowKey));
    setSelectedTrialParameterRowKeys((current) => current.filter((rowKey) => availableRowKeys.has(rowKey)));
  }, [trialParameterRows]);

  return {
    trialBusinessDates,
    selectedTrialParameterRowKeys,
    setSelectedTrialParameterRowKeys,
    trialMaxRows,
    setTrialMaxRows,
    trialRunMessage,
    setTrialRunMessage,
    isStartingTrialRun,
    setIsStartingTrialRun,
    isTrialModalOpen,
    openTrialModal: () => setIsTrialModalOpen(true),
    closeTrialModal: () => setIsTrialModalOpen(false),
    isTrialTaskListExpanded,
    setIsTrialTaskListExpanded,
    handleToggleTrialBusinessDate: (businessDate: string) => {
      setTrialBusinessDates((current) => (
        current.includes(businessDate)
          ? current.filter((item) => item !== businessDate)
          : [...current, businessDate]
      ));
    },
    handleToggleTrialParameterRow: (rowKey: string) => {
      setSelectedTrialParameterRowKeys((current) => (
        current.includes(rowKey)
        ? current.filter((item) => item !== rowKey)
        : [...current, rowKey]
      ));
    },
  };
}
