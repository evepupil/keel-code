/**
 * 弹窗（Radix Dialog 封装）：遮罩、居中、Esc / 点遮罩关闭、焦点圈定。
 * 用 Radix 而非原生 <dialog>：原生 top-layer 会把传送门渲染的菜单 / 弹出层压在下面。
 * size：sm = 表单类（32rem）；lg = 设置类（900×620，内容区自己排版）。
 */
import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { IconButton } from "./icon-button";

export function Dialog({
  open,
  onClose,
  title,
  header,
  size = "sm",
  children,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  /** 无障碍标题；也是默认头部显示的文字 */
  title: string;
  /** 自定义头部（替换默认「标题 + 关闭」行；仍需自带关闭按钮时用 <DialogClose>） */
  header?: ReactNode;
  size?: "sm" | "lg";
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={(v) => (v ? undefined : onClose())}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-[oklch(20%_0.02_250/0.35)]" />
        <RD.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-line bg-panel text-ink shadow-lg outline-none",
            size === "sm" && "w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] rounded-lg",
            size === "lg" &&
              "h-[min(620px,calc(100vh-40px))] w-[min(900px,calc(100vw-40px))] rounded-xl",
            className,
          )}
        >
          {header ?? (
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
              <RD.Title className="text-sm font-semibold">{title}</RD.Title>
              <RD.Close asChild>
                <IconButton aria-label="关闭">
                  <X />
                </IconButton>
              </RD.Close>
            </div>
          )}
          {header ? <RD.Title className="sr-only">{title}</RD.Title> : null}
          <RD.Description className="sr-only">{title}</RD.Description>
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", bodyClassName)}>{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export const DialogClose = RD.Close;
