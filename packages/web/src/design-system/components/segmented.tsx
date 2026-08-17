import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * 分段单选：思考档、主题、审批档位这类 2–5 个互斥选项。
 * 选项可带一行小字说明（sub），带说明时纵向排。
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; sub?: ReactNode; disabled?: boolean }[];
  size?: "sm" | "md";
  className?: string;
}) {
  const withSub = options.some((o) => o.sub);
  return (
    <div className={cn("flex gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md border text-left transition-colors outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "px-2.5 py-1.5 text-[12.5px]",
              withSub ? "text-left" : "text-center",
              on
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-panel text-ink hover:bg-panel-2",
            )}
          >
            <span className="block">{o.label}</span>
            {o.sub ? (
              <span className={cn("block text-[11.5px]", on ? "text-accent/80" : "text-ink-faint")}>
                {o.sub}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
