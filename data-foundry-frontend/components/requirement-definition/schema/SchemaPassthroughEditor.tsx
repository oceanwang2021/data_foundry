"use client";

type Props = {
  editable: boolean;
  enabled?: boolean;
  content?: string;
  displayValue: string;
  onEnabledChange?: (enabled: boolean) => void;
  onContentChange?: (value: string) => void;
};

export function SchemaPassthroughEditor({
  editable,
  enabled,
  content,
  displayValue,
  onEnabledChange,
  onContentChange,
}: Props) {
  if (!editable) {
    return <span>{displayValue}</span>;
  }

  return (
    <div className="space-y-1.5">
      <select
        value={enabled ? "yes" : "no"}
        onChange={(event) => onEnabledChange?.(event.target.value === "yes")}
        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
      >
        <option value="no">否</option>
        <option value="yes">是</option>
      </select>
      {enabled ? (
        <input
          value={content ?? ""}
          onChange={(event) => onContentChange?.(event.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          placeholder="填写透传内容"
        />
      ) : null}
    </div>
  );
}
