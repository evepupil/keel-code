import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * 纯图标按钮：头部 / 侧栏 / 卡片工具条通用。
 * size：xs 22px（行内悬停动作）、sm 24px（消息工具条）、md 30px（头部 / 输入框）。
 * active：按下态（例如抽屉开着时的开关）。
 */
export function IconButton({
  className,
  size = "md",
  active = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "xs" | "sm" | "md";
  active?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0",
        size === "xs" &&
          "h-[22px] w-[22px] rounded-[5px] text-ink-faint [&>svg]:h-3.5 [&>svg]:w-3.5",
        size === "sm" && "h-6 w-6 [&>svg]:h-3.5 [&>svg]:w-3.5",
        size === "md" && "h-[30px] w-[30px] [&>svg]:h-4 [&>svg]:w-4",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        className,
      )}
      {...props}
    />
  );
}
