import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

/** 原生 <dialog> 封装：Esc / 点遮罩关闭，居中，滚动锁定交给浏览器。 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 点击遮罩关闭；键盘走原生 dialog 的 Esc
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-0 text-ink shadow-md backdrop:bg-black/30",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
