import type { WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  selectedWtId: string;
  wideTables: WideTable[];
  onSelect: (wideTableId: string) => void;
};

export default function WideTableSelector({
  selectedWtId,
  wideTables,
  onSelect,
}: Props) {
  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="flex gap-2 overflow-x-auto">
        {wideTables.map((wt) => (
          <button
            key={wt.id}
            type="button"
            onClick={() => onSelect(wt.id)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-xs",
              selectedWtId === wt.id
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {wt.name}
          </button>
        ))}
      </div>
    </section>
  );
}
