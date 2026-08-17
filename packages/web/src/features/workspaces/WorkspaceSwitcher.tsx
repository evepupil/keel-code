import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";
import { appStore, useAppState } from "../../store/app-store";
import { AddWorkspaceDialog } from "./AddWorkspaceDialog";

/** 侧栏顶部：当前工作区 + 下拉切换 / 添加 / 移除。 */
export function WorkspaceSwitcher() {
  const workspaces = useAppState((s) => s.workspaces);
  const workspaceId = useAppState((s) => s.workspaceId);
  const project = useAppState((s) => s.project);
  const pending = useAppState((s) => s.pendingByWorkspace);
  const wsConnected = useAppState((s) => s.wsConnected);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = workspaces.find((w) => w.id === workspaceId);
  const otherPending = Object.entries(pending)
    .filter(([id, n]) => id !== workspaceId && n > 0)
    .reduce((a, [, n]) => a + n, 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left hover:bg-panel-2"
        title={current?.path ?? project?.cwd}
      >
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", wsConnected ? "bg-ok" : "bg-danger")}
          title={wsConnected ? "已连接" : "连接断开"}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {current?.name ?? project?.name ?? "选择工作区"}
          </span>
          <span className="block truncate text-[11px] text-ink-faint">
            {current?.path ?? project?.cwd ?? `${workspaces.length} 个工作区`}
          </span>
        </span>
        {otherPending > 0 ? <Badge tone="warn">{otherPending}</Badge> : null}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-faint" />
      </button>

      {open ? (
        <div className="absolute left-2 right-2 top-full z-20 mt-1 rounded-md border border-line bg-panel py-1 shadow-md">
          <ul className="max-h-72 overflow-y-auto">
            {workspaces.map((w) => {
              const active = w.id === workspaceId;
              const n = pending[w.id] ?? 0;
              return (
                <li key={w.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void appStore.selectWorkspace(w.id);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-panel-2",
                      !w.exists && "opacity-50",
                    )}
                    title={w.path}
                  >
                    <Check
                      className={cn("h-3.5 w-3.5 shrink-0", active ? "text-accent" : "opacity-0")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{w.name}</span>
                      <span className="block truncate text-[11px] text-ink-faint">{w.path}</span>
                    </span>
                    {n > 0 && !active ? <Badge tone="warn">{n}</Badge> : null}
                    {w.loaded ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-ok" title="已加载" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    title="移除工作区（不删文件）"
                    onClick={() => {
                      setOpen(false);
                      void appStore.removeWorkspace(w.id);
                    }}
                    className="mr-1 cursor-pointer rounded-sm p-1 text-ink-faint opacity-0 hover:bg-panel-2 hover:text-danger group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAdding(true);
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel-2"
            >
              <Plus className="h-3.5 w-3.5" />
              添加工作区…
            </button>
          </div>
        </div>
      ) : null}

      <AddWorkspaceDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
