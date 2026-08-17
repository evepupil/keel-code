import { LayoutGrid, Plus, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { SessionListItem } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Badge } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";
import { appStore, useAppState } from "../../store/app-store";
import { NewSessionDialog } from "./NewSessionDialog";

export function Sidebar() {
  const project = useAppState((s) => s.project);
  const sessions = useAppState((s) => s.sessions);
  const currentId = useAppState((s) => s.currentId);
  const view = useAppState((s) => s.view);
  const wsConnected = useAppState((s) => s.wsConnected);
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={project?.cwd}>
            {project?.name ?? "keel"}
          </div>
          <div className="truncate text-[11px] text-ink-faint" title={project?.cwd}>
            {project?.cwd}
          </div>
        </div>
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", wsConnected ? "bg-ok" : "bg-danger")}
          title={wsConnected ? "已连接" : "连接断开"}
        />
      </div>

      <div className="px-3 pb-2">
        <Button className="w-full" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          新建对话
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-2">
            <div className="px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {g.label}
            </div>
            {g.items.map(({ item, depth }) => (
              <SessionRow
                key={item.meta.id}
                item={item}
                depth={depth}
                active={view === "chat" && item.meta.id === currentId}
                onClick={() => appStore.selectSession(item.meta.id)}
              />
            ))}
          </div>
        ))}
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-ink-faint">还没有对话</p>
        ) : null}
      </nav>

      <div className="space-y-1 border-t border-line p-2">
        <Button
          variant="ghost"
          className={cn("w-full justify-start", view === "board" && "bg-panel-2 text-ink")}
          onClick={() => appStore.setView("board")}
        >
          <LayoutGrid className="h-4 w-4" />
          看板
        </Button>
        <Button
          variant="ghost"
          className={cn("w-full justify-start", view === "settings" && "bg-panel-2 text-ink")}
          onClick={() => appStore.setView("settings")}
        >
          <Settings className="h-4 w-4" />
          设置
        </Button>
      </div>

      <NewSessionDialog open={creating} onClose={() => setCreating(false)} />
    </aside>
  );
}

function SessionRow({
  item,
  depth,
  active,
  onClick,
}: {
  item: SessionListItem;
  depth: number;
  active: boolean;
  onClick: () => void;
}) {
  const streaming = item.live?.isStreaming ?? false;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-2",
        active && "bg-accent-soft text-ink hover:bg-accent-soft",
        item.meta.archived && "opacity-60",
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <span className="min-w-0 flex-1 truncate">{item.meta.title}</span>
      {streaming ? <Badge tone="accent">运行中</Badge> : null}
    </button>
  );
}

interface Group {
  label: string;
  items: { item: SessionListItem; depth: number }[];
}

/** 主对话 / 对话（子 agent 挂在父对话下）/ 已归档 三组。 */
export function groupSessions(sessions: SessionListItem[]): Group[] {
  const active = sessions.filter((s) => !s.meta.archived);
  const archived = sessions.filter((s) => s.meta.archived);
  const byParent = new Map<string, SessionListItem[]>();
  for (const s of active) {
    if (s.meta.kind === "subagent" && s.meta.parentId) {
      const list = byParent.get(s.meta.parentId) ?? [];
      list.push(s);
      byParent.set(s.meta.parentId, list);
    }
  }
  const withChildren = (s: SessionListItem, depth: number) => [
    { item: s, depth },
    ...(byParent.get(s.meta.id) ?? []).map((c) => ({ item: c, depth: depth + 1 })),
  ];
  const groups: Group[] = [];
  const mains = active.filter((s) => s.meta.kind === "main");
  if (mains.length)
    groups.push({ label: "主对话", items: mains.flatMap((m) => withChildren(m, 0)) });
  const convs = active.filter((s) => s.meta.kind === "conversation");
  if (convs.length) groups.push({ label: "对话", items: convs.flatMap((c) => withChildren(c, 0)) });
  const orphans = active.filter(
    (s) =>
      s.meta.kind === "subagent" &&
      (!s.meta.parentId || !active.some((p) => p.meta.id === s.meta.parentId)),
  );
  if (orphans.length)
    groups.push({ label: "子 agent", items: orphans.map((o) => ({ item: o, depth: 0 })) });
  if (archived.length)
    groups.push({ label: "已归档", items: archived.map((a) => ({ item: a, depth: 0 })) });
  return groups;
}
