"use client";

import PromptSectionField from "@/components/requirement-tasks/prompts/PromptSectionField";

type Props = {
  label: string;
  value: string;
  editable: boolean;
  rows: number;
  onChange: (value: string) => void;
};

export default function PromptReadonlyBlock({
  label,
  value,
  editable,
  rows,
  onChange,
}: Props) {
  return (
    <PromptSectionField
      label={label}
      value={value}
      editable={editable}
      rows={rows}
      onChange={onChange}
    />
  );
}
