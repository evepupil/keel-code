/**
 * 下拉菜单（Radix DropdownMenu 封装）：项目菜单、模型 / 权限选择等。
 * 传送门渲染，不受侧栏 overflow 裁切；键盘、焦点、Esc 全部交给 Radix。
 */
import * as RM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Menu = RM.Root;
export const MenuTrigger = RM.Trigger;
export const MenuGroup = RM.Group;

const contentClass =
  "z-50 min-w-[12rem] rounded-lg border border-line bg-panel p-1.5 text-sm text-ink shadow-lg outline-none";

export function MenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof RM.Content>) {
  return (
    <RM.Portal>
      <RM.Content sideOffset={sideOffset} className={cn(contentClass, className)} {...props} />
    </RM.Portal>
  );
}

export function MenuItem({
  className,
  danger = false,
  icon,
  hint,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RM.Item> & {
  danger?: boolean;
  icon?: ReactNode;
  /** 右侧灰字（快捷键 / 附注） */
  hint?: ReactNode;
}) {
  return (
    <RM.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-panel-2",
        danger && "text-danger",
        className,
      )}
      {...props}
    >
      {icon ? <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
      <span className="min-w-0 flex-1">{children}</span>
      {hint ? <span className="ml-3 shrink-0 text-xs text-ink-faint">{hint}</span> : null}
    </RM.Item>
  );
}

/** 单选项：左侧留出对勾位置，选中显示 ✓。 */
export function MenuRadioItem({
  className,
  hint,
  sub,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RM.RadioItem> & { hint?: ReactNode; sub?: ReactNode }) {
  return (
    <RM.RadioItem
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pr-2 pl-2 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-panel-2",
        className,
      )}
      {...props}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-accent">
        <RM.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </RM.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {sub ? <span className="block text-xs text-ink-faint">{sub}</span> : null}
      </span>
      {hint ? <span className="ml-3 shrink-0 text-xs text-ink-faint">{hint}</span> : null}
    </RM.RadioItem>
  );
}
export const MenuRadioGroup = RM.RadioGroup;

export function MenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof RM.Label>) {
  return (
    <RM.Label
      className={cn("px-2 pt-1.5 pb-0.5 text-[11px] text-ink-faint", className)}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RM.Separator>) {
  return <RM.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}
