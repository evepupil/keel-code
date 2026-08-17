import { Anchor, Archive, Pin } from "lucide-react";
import type { SessionListItem } from "../../api/types";
import { StatusDot } from "../../design-system/components/dot";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../design-system/components/hover-card";
import { IconButton } from "../../design-system/components/icon-button";
import { cn } from "../../lib/cn";
import { formatRelative, formatTokens } from "../../lib/format";
import { appStore } from "../../store/app-store";
import { isPinned } from "./group-sessions";

export function SessionRow({
  item,
  workspaceId,
  active,
}: {
  item: SessionListItem;
  workspaceId: string;
  active: boolean;
}) {
  const main = item.meta.kind === "main";
  const pinned = isPinned(item);
  const streaming = item.live?.isStreaming ?? false;
  const pending = false;
  const usage = item.usage ?? { input: 0, output: 0, cacheRead: 0 };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "group flex w-full items-center gap-1.5 rounded-md text-left text-sm",
            active ? "bg-accent-soft" : "hover:bg-panel-2",
            item.meta.archived && "opacity-60",
          )}
        >
          <button
            type="button"
            onClick={() => void appStore.selectWorkspace(workspaceId, { sessionId: item.meta.id })}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1",
              main ? "pl-2" : "pl-7",
            )}
          >
            {main ? <Anchor className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> : null}
            <span className="min-w-0 flex-1 truncate">{item.meta.title}</span>
            {streaming ? <StatusDot state="run" title="运行中" /> : null}
            {pending ? <StatusDot state="pending" title="有待审批" /> : null}
            {pinned && !main ? <Pin className="h-3 w-3 shrink-0 text-ink-faint" /> : null}
            <span className="shrink-0 text-[11px] text-ink-faint group-hover:hidden">
              {formatRelative(item.lastActiveAt)}
            </span>
          </button>
          {!main ? (
            <span className="hidden shrink-0 pr-1 group-hover:inline-flex">
              <IconButton
                size="xs"
                title={pinned ? "取消置顶" : "置顶"}
                onClick={() =>
                  void appStore.patchSession(item.meta.id, { pinned: !pinned }, workspaceId)
                }
              >
                <Pin />
              </IconButton>
              <IconButton
                size="xs"
                title={item.meta.archived ? "取消归档" : "归档"}
                onClick={() =>
                  void appStore.patchSession(
                    item.meta.id,
                    { archived: !item.meta.archived },
                    workspaceId,
                  )
                }
              >
                <Archive />
              </IconButton>
            </span>
          ) : null}
        </div>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex items-baseline gap-2 px-2 py-1.5">
          <span className="min-w-0 truncate text-sm font-semibold">{item.meta.title}</span>
          <span className="ml-auto shrink-0 text-xs text-ink-faint">
            {formatRelative(item.lastActiveAt)}
          </span>
        </div>
        {item.meta.role ? (
          <div className="px-2 pb-1.5 text-[12.5px] text-ink-muted">{item.meta.role}</div>
        ) : null}
        <div className="my-1 h-px bg-line" />
        <div className="px-2 pt-1 text-[11px] text-ink-faint">token 用量</div>
        <div className="grid grid-cols-3 gap-2 px-2 pt-1 pb-1.5">
          <Tok label="缓存命中" value={usage.cacheRead} />
          <Tok label="未命中" value={usage.input} />
          <Tok label="输出" value={usage.output} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Tok({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="text-sm font-medium">{formatTokens(value)}</div>
    </div>
  );
}
