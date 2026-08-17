/**
 * 弹出层（Radix Popover 封装）：上拉面板（看板 / 子 agent / 任务）、上下文用量明细等。
 * 与 Menu 的区别：内容是自由布局，不是一列可选项。
 */
import * as RP from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = "start",
  ...props
}: ComponentPropsWithoutRef<typeof RP.Content>) {
  return (
    <RP.Portal>
      <RP.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          "z-50 rounded-lg border border-line bg-panel p-1.5 text-sm text-ink shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </RP.Portal>
  );
}
