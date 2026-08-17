/**
 * Tabs（Radix Tabs 封装）。设置弹窗用竖排（左栏），其他地方可用横排。
 */
import * as RT from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Tabs = RT.Root;
export const TabsContent = RT.Content;

export function TabsList({
  className,
  vertical = false,
  ...props
}: ComponentPropsWithoutRef<typeof RT.List> & { vertical?: boolean }) {
  return (
    <RT.List
      className={cn(
        vertical ? "flex flex-col gap-0.5" : "flex items-center gap-1 border-b border-line",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  icon,
  vertical = false,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RT.Trigger> & { icon?: ReactNode; vertical?: boolean }) {
  return (
    <RT.Trigger
      className={cn(
        "flex items-center gap-2 text-left text-sm text-ink-muted outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
        vertical
          ? "w-full rounded-md px-2.5 py-1.5 hover:bg-side-2 data-[state=active]:bg-panel data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-sm"
          : "-mb-px border-b-2 border-transparent px-2 py-1.5 hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </RT.Trigger>
  );
}
