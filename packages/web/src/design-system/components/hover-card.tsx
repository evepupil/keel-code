/**
 * 悬浮信息卡（Radix HoverCard 封装）：侧栏项目 / 会话行悬停时在右侧展示详情。
 * 鼠标移进卡片不会消失；触屏 / 键盘不触发（信息只是补充，不承担操作入口）。
 */
import * as RH from "@radix-ui/react-hover-card";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

export function HoverCard({
  openDelay = 260,
  closeDelay = 160,
  ...props
}: ComponentPropsWithoutRef<typeof RH.Root>) {
  return <RH.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />;
}
export const HoverCardTrigger = RH.Trigger;

export function HoverCardContent({
  className,
  side = "right",
  align = "start",
  sideOffset = 10,
  ...props
}: ComponentPropsWithoutRef<typeof RH.Content>) {
  return (
    <RH.Portal>
      <RH.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 w-72 rounded-lg border border-line bg-panel p-1.5 text-sm text-ink shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </RH.Portal>
  );
}
