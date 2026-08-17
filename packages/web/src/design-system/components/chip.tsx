import { ChevronDown, ChevronUp } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Chip：输入框里的小选择器（outline）和输入框上方的上拉按钮（soft）。
 * label 加粗、status 灰字；caret 决定右侧箭头朝向（下拉 / 上拉）；active = 面板打开中。
 */
export function Chip({
  variant = "outline",
  icon,
  label,
  status,
  caret,
  active = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "outline" | "soft";
  icon?: ReactNode;
  label?: ReactNode;
  status?: ReactNode;
  caret?: "down" | "up";
  active?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12.5px] text-ink transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
        variant === "outline" && "h-7 border border-line bg-panel hover:bg-panel-2",
        variant === "soft" && "bg-panel-2 hover:bg-side-2",
        active && "bg-accent-soft text-accent hover:bg-accent-soft",
        className,
      )}
      {...props}
    >
      {icon}
      {label ? <span className="font-medium">{label}</span> : null}
      {status ? (
        <span className={cn("text-ink-muted", active && "text-accent")}>{status}</span>
      ) : null}
      {children}
      {caret === "down" ? (
        <ChevronDown className="!h-3.5 !w-3.5 text-ink-faint" />
      ) : caret === "up" ? (
        <ChevronUp
          className={cn(
            "!h-3.5 !w-3.5 text-ink-faint transition-transform",
            active && "rotate-180",
          )}
        />
      ) : null}
    </button>
  );
}
