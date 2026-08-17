import { cn } from "../../lib/cn";

/**
 * 状态点：run = 运行中（呼吸）、ok = 完成、pending = 待处理（审批 / 待决策）、bad = 失败、idle = 灰。
 * 只用颜色 + 呼吸表达状态，配 title 给鼠标悬停说明。
 */
export function StatusDot({
  state,
  className,
  title,
}: {
  state: "run" | "ok" | "pending" | "bad" | "idle";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
        state === "run" && "animate-pulse-dot bg-accent",
        state === "ok" && "bg-ok",
        state === "pending" && "bg-warn",
        state === "bad" && "bg-danger",
        state === "idle" && "bg-line-strong",
        className,
      )}
    />
  );
}
