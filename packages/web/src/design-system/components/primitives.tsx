/**
 * 基础控件：Input / Textarea / Select / Badge / Card / Spinner / Field / EmptyState。
 * 全部走 token，不带业务。
 */
import type { ComponentPropsWithRef, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

const control =
  "w-full rounded-md border border-line bg-panel px-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-2 focus:outline-offset-0 focus:outline-accent/40 disabled:opacity-50";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(control, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea className={cn(control, "min-h-[2.5rem] py-1.5 leading-6", className)} {...props} />
  );
}

export function Select({ className, children, ...props }: ComponentPropsWithRef<"select">) {
  return (
    <select className={cn(control, "h-8", className)} {...props}>
      {children}
    </select>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";
const badgeTone: Record<Tone, string> = {
  neutral: "bg-panel-2 text-ink-muted",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4",
        badgeTone[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-line bg-panel shadow-sm", className)} {...props} />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent",
        className,
      )}
      role="status"
      aria-label="加载中"
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children 是嵌套在 label 内的输入控件（隐式关联）
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
    >
      <p className="text-sm text-ink-muted">{title}</p>
      {action}
    </div>
  );
}
