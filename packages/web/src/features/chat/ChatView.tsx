import { ArrowLeft, PanelRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../design-system/components/icon-button";
import { Badge, Spinner } from "../../design-system/components/primitives";
import { appStore, useAppState } from "../../store/app-store";
import { emptyChat } from "../../store/apply-event";
import { Composer } from "../composer/Composer";
import { buildAssistantMetas } from "../composer/stats";
import { ContextDrawer } from "../context/ContextDrawer";
import { ApprovalCard } from "./ApprovalCard";
import { indexToolResults, MessageItem } from "./MessageItem";
import { AcceptanceCard, DesignConfirmCard, DesignFreezeCard } from "./ProcessCards";
import { ReviewCard, type ReviewEntryView } from "./ReviewCard";

export function ChatView() {
  const currentId = useAppState((s) => s.currentId);
  const sessions = useAppState((s) => s.sessions);
  const chats = useAppState((s) => s.chats);
  const approvals = useAppState((s) => s.approvals);
  const drawerOpen = useAppState((s) => s.drawerOpen);
  const item = sessions.find((s) => s.meta.id === currentId);
  const chat = currentId ? (chats[currentId] ?? emptyChat()) : emptyChat();
  const toolResults = useMemo(() => indexToolResults(chat.messages), [chat.messages]);
  const metas = useMemo(() => buildAssistantMetas(chat.messages), [chat.messages]);
  const timeline = useMemo(
    () => buildTimeline(chat.messages, chat.entries),
    [chat.messages, chat.entries],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [rosterKey, setRosterKey] = useState(0);
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming) setRosterKey((k) => k + 1);
    wasStreaming.current = chat.streaming;
  }, [chat.streaming]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  });

  if (!currentId || !item) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-ink-muted">
        从左侧选一条对话
      </div>
    );
  }

  const meta = item.meta;
  const empty = chat.loaded && chat.messages.length === 0 && !chat.streaming;
  const isSub = meta.kind === "subagent";
  const parent = meta.parentId ? sessions.find((s) => s.meta.id === meta.parentId) : undefined;

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-4">
          {isSub ? (
            <>
              <div className="flex min-w-0 items-center gap-1.5 text-sm">
                {parent ? (
                  <button
                    type="button"
                    className="truncate text-ink-muted hover:text-ink"
                    onClick={() => appStore.selectSession(parent.meta.id)}
                  >
                    {parent.meta.title}
                  </button>
                ) : null}
                {parent ? <span className="text-ink-faint">›</span> : null}
                <span className="truncate font-semibold">{meta.title}</span>
              </div>
              {chat.streaming ? <Badge tone="accent">运行中</Badge> : <Badge tone="ok">完成</Badge>}
              <span className="min-w-0 truncate text-xs text-ink-faint">
                {meta.model.provider}/{meta.model.id}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12.5px] hover:bg-panel-2"
                onClick={() => parent && appStore.selectSession(parent.meta.id)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回对话
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{meta.title}</div>
                {meta.role ? (
                  <div className="truncate text-[11.5px] text-ink-faint" title={meta.role}>
                    {meta.role}
                  </div>
                ) : null}
              </div>
              <span className="flex-1" />
            </>
          )}
          <IconButton
            active={drawerOpen}
            title="上下文"
            onClick={() => appStore.setDrawer(!drawerOpen)}
          >
            <PanelRight />
          </IconButton>
        </header>

        {empty && !isSub ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-[8vh]">
            <div className="mb-5 text-[28px] font-semibold tracking-tight">keel</div>
            <div className="w-full max-w-[800px]">
              <Composer session={item} empty />
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto py-5"
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              }}
            >
              {!chat.loaded ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <div className="mx-auto flex max-w-[760px] flex-col gap-3.5">
                  {timeline.map((row, i) =>
                    row.kind === "entry" ? (
                      <EntryCard key={row.entry.id} entry={row.entry} sessionId={meta.id} />
                    ) : (
                      <MessageItem
                        // biome-ignore lint/suspicious/noArrayIndexKey: 消息没有稳定 id
                        key={`${row.message.role}-${row.message.timestamp}-${i}`}
                        message={row.message}
                        toolResults={toolResults}
                        meta={metas.get(row.message)}
                        streaming={
                          chat.streaming && row.message === chat.messages[chat.messages.length - 1]
                        }
                      />
                    ),
                  )}
                  {chat.streaming && Object.keys(chat.activeTools).length > 0 ? (
                    <div className="px-5 text-xs text-ink-faint">
                      正在执行：
                      {Object.values(chat.activeTools)
                        .map((t) => t.toolName)
                        .join("、")}
                    </div>
                  ) : null}
                  {approvals
                    .filter((a) => a.sessionId === meta.id || a.parentId === meta.id)
                    .map((a) => (
                      <ApprovalCard key={a.id} request={a} fromSubagent={a.sessionId !== meta.id} />
                    ))}
                </div>
              )}
              {isSub ? (
                <p className="px-5 pt-6 text-center text-xs text-ink-faint">
                  子 agent 轨迹只读；结束后结论交回「{parent?.meta.title ?? "父对话"}」。
                </p>
              ) : null}
            </div>
            {isSub ? null : <Composer session={item} />}
          </>
        )}
      </div>
      <ContextDrawer sessionId={meta.id} refreshKey={rosterKey} />
    </div>
  );
}

type TimelineItem =
  | { kind: "message"; message: import("../../api/types").EngineMessage; at: number }
  | { kind: "entry"; entry: import("../../api/types").SessionEntry; at: number };

export function buildTimeline(
  messages: import("../../api/types").EngineMessage[],
  entries: import("../../api/types").SessionEntry[],
): TimelineItem[] {
  const items: TimelineItem[] = messages.map((message) => ({
    kind: "message",
    message,
    at: message.timestamp,
  }));
  for (const entry of entries) {
    if (!RENDERED_ENTRIES.has(entry.customType)) continue;
    items.push({ kind: "entry", entry, at: entry.timestamp });
  }
  return items
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => a.it.at - b.it.at || a.idx - b.idx)
    .map((x) => x.it);
}

const RENDERED_ENTRIES = new Set(["keel/review", "keel/design-confirm", "keel/design-freeze"]);

function EntryCard({
  entry,
  sessionId,
}: {
  entry: import("../../api/types").SessionEntry;
  sessionId: string;
}) {
  switch (entry.customType) {
    case "keel/review": {
      const data = entry.data as ReviewEntryView;
      return (
        <>
          <ReviewCard data={data} />
          {data.action === "pass" ? (
            <AcceptanceCard sessionId={sessionId} batch={data.batch} />
          ) : null}
        </>
      );
    }
    case "keel/design-confirm":
      return (
        <DesignConfirmCard
          data={entry.data as { path: string; summary: string; at: string }}
          sessionId={sessionId}
        />
      );
    case "keel/design-freeze":
      return (
        <DesignFreezeCard
          data={entry.data as { path: string; commit: string; at: string; note?: string }}
        />
      );
    default:
      return null;
  }
}
