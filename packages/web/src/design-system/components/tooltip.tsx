/**
 * 提示（Radix Tooltip 封装）。App 根部包一层 <TooltipProvider>，之后 <Tip label="…">按钮</Tip> 即可。
 * 只给纯图标按钮用；有文字的控件不加。
 */
import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RT.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </RT.Provider>
  );
}

export function Tip({
  label,
  side = "bottom",
  children,
}: {
  label: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] rounded-md bg-ink px-2 py-1 text-xs text-canvas shadow-md"
        >
          {label}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
