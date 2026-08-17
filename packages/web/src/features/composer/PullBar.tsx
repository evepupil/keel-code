/**
 * 输入框上方：看板 / 子 agent / 任务。同一时间只开一个上拉。
 */
import { Bot, CheckCircle2, Circle, LayoutGrid, ListChecks, Loader2 } from "lucide-react";
import { cloneElement, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { BoardData, SessionListItem } from "../../api/types";
import { Chip } from "../../design-system/components/chip";
import { StatusDot } from "../../design-system/components/dot";
import { Popover, PopoverAnchor, PopoverContent } from "../../design-system/components/popover";
import { Badge } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";
import { formatTokens } from "../../lib/format";
import { appStore, useAppState } from "../../store/app-store";
import { type TaskItem, taskSummary, tasksOf } from "./tasks";

const TONE: Record<string, "ok" | "accent" | "warn" | "danger" | "neutral"> = {
  已完成: "ok",
  进行中: "accent",
  阻塞: "danger",
  未开始: "neutral",
};

export function PullBar({ sessionId }: { sessionId: string }) {
  const sessions = useAppState((s) => s.sessions);
  const workspaceId = useAppState((s) => s.workspaceId);
  const entries = useAppState((s) => s.chats[sessionId]?.entries);
  const subs = useMemo(
    () => sessions.filter((s) => s.meta.kind === "subagent" && s.meta.parentId === sessionId),
    [sessions, sessionId],
  );
  const running = subs.filter((s) => s.live?.isStreaming).length;
  const tasks = useMemo(() => tasksOf(entries ?? []), [entries]);
  const taskSt = taskSummary(tasks) ?? undefined;
  const [open, setOpen] = useState<"board" | "subs" | "tasks" | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);

  useEffect(() => {
    if (open !== "board" || !workspaceId) return;
    void api
      .board()
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [open, workspaceId]);

  const doing = board?.roadmap?.milestones.find((m) => m.status === "进行中");
  const boardSt = doing ? `${doing.id} 进行中` : undefined;
  const subSt = subs.length
    ? running
      ? `${running} 运行中 / ${subs.length}`
      : String(subs.length)
    : undefined;

  // Radix trigger 自带的 pointerdown 切换 + 外部 dismiss 与共享状态打架（面板开了又被关），
  // 改为完全受控：chip 只做锚点，点击切换由自己的 onClick 管；面板只认 Esc 与非 chip 的外部点击。
  const pull = (key: "board" | "subs" | "tasks") => ({
    open: open === key,
    chipActive: open === key,
    chipProps: {
      "data-pull-chip": key,
      onClick: () => setOpen((prev) => (prev === key ? null : key)),
    },
    onOpenChange: (v: boolean) => setOpen(v ? key : (prev) => (prev === key ? null : prev)),
  });

  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Pull
        {...pull("board")}
        chip={
          <Chip variant="soft" icon={<LayoutGrid />} label="看板" status={boardSt} caret="up">
            {board && board.decisions.length > 0 ? <StatusDot state="pending" /> : null}
          </Chip>
        }
        width="w-[32rem]"
      >
        <BoardPanel data={board} />
      </Pull>
      <Pull
        {...pull("subs")}
        chip={
          <Chip variant="soft" icon={<Bot />} label="子 agent" status={subSt} caret="up">
            {running ? <StatusDot state="run" /> : null}
          </Chip>
        }
        width="w-[30rem]"
      >
        <SubPanel items={subs} />
      </Pull>
      <span className="flex-1" />
      <Pull
        {...pull("tasks")}
        chip={<Chip variant="soft" icon={<ListChecks />} label="任务" status={taskSt} caret="up" />}
        width="w-[28rem]"
        align="end"
      >
        <TaskPanel tasks={tasks} />
      </Pull>
    </div>
  );
}

function Pull({
  open,
  onOpenChange,
  chipActive,
  chipProps,
  chip,
  children,
  width,
  align = "start",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chipActive: boolean;
  chipProps: { "data-pull-chip": string; onClick: () => void };
  chip: React.ReactElement<{ active?: boolean } & Record<string, unknown>>;
  children: React.ReactNode;
  width: string;
  align?: "start" | "end";
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        {cloneElement(chip, { ...chipProps, active: chipActive })}
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align={align}
        className={`${width} max-h-[62vh] overflow-y-auto p-1.5`}
        onInteractOutside={(e) => {
          // 点另一个 chip 由它自己的 onClick 切换；其余外部点击才收起
          const el = e.target instanceof Element ? e.target : null;
          if (!el?.closest("[data-pull-chip]")) onOpenChange(false);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function BoardPanel({ data }: { data: BoardData | null }) {
  if (!data)
    return <div className="px-2.5 py-6 text-center text-[12.5px] text-ink-faint">加载中</div>;
  const ms = data.roadmap?.milestones ?? [];
  return (
    <div>
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
        <span className="font-medium">看板</span>
        <span className="text-ink-muted">{data.roadmap?.title}</span>
        <button
          type="button"
          className="ml-auto text-xs text-accent"
          onClick={() => appStore.setView("board")}
        >
          完整看板
        </button>
      </div>
      {ms.map((m) => (
        <div key={m.id} className="flex items-center gap-2 px-2.5 py-1 text-[13px]">
          <span className="w-7 shrink-0 font-semibold">{m.id}</span>
          <span className="min-w-0 flex-1 truncate">{m.goal}</span>
          <Badge tone={TONE[m.status] ?? "neutral"}>{m.status}</Badge>
        </div>
      ))}
      {data.review.lastPass ? (
        <>
          <div className="mt-1.5 border-t border-line px-2.5 pt-2 text-[11px] text-ink-faint">
            review
          </div>
          <div className="px-2.5 py-1 text-[12.5px] text-ink-muted">
            距上次通过 {data.review.roundsSincePass} 轮 · {data.review.lastPass.tree.slice(0, 7)}
          </div>
        </>
      ) : null}
      {data.decisions.length > 0 ? (
        <>
          <div className="mt-1.5 border-t border-line px-2.5 pt-2 text-[11px] text-ink-faint">
            待决策 {data.decisions.length}
          </div>
          {data.decisions.map((d) => (
            <div key={d.line} className="px-2.5 py-0.5 text-[12.5px] text-ink-muted">
              · {d.text}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function TaskPanel({ tasks }: { tasks: TaskItem[] }) {
  if (tasks.length === 0)
    return <div className="px-2.5 py-6 text-center text-[12.5px] text-ink-faint">还没有任务</div>;
  return (
    <div>
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
        <ListChecks className="h-4 w-4" />
        <span className="font-medium">任务</span>
        <span className="font-normal text-ink-muted">{taskSummary(tasks)}</span>
      </div>
      {tasks.map((t, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 清单按序展示
          key={`${i}-${t.text}`}
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 text-[13px]",
            t.status === "todo" && "text-ink-muted",
          )}
        >
          {t.status === "done" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
          ) : t.status === "doing" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-line-strong" />
          )}
          <span className="min-w-0 flex-1">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function SubPanel({ items }: { items: SessionListItem[] }) {
  if (items.length === 0)
    return (
      <div className="px-2.5 py-6 text-center text-[12.5px] text-ink-faint">还没有子 agent</div>
    );
  return (
    <div>
      {items.map((s) => {
        const run = s.live?.isStreaming;
        const task = typeof s.meta.extra?.task === "string" ? s.meta.extra.task : s.meta.role;
        return (
          <button
            key={s.meta.id}
            type="button"
            className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-panel-2"
            onClick={() => appStore.selectSession(s.meta.id)}
          >
            <StatusDot state={run ? "run" : "ok"} className="mt-1.5" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{s.meta.title}</span>
              {task ? (
                <span className="block truncate text-[11.5px] text-ink-faint">{task}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-right text-[11.5px] text-ink-faint">
              {formatTokens(s.usage?.cacheRead + s.usage?.input + s.usage?.output || 0)} tok
            </span>
          </button>
        );
      })}
    </div>
  );
}
