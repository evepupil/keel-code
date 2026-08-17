import { ArrowUp, Square } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../design-system/components/button";
import { EmptyState, Spinner, Textarea } from "../../design-system/components/primitives";
import { appStore, useAppState } from "../../store/app-store";
import { emptyChat } from "../../store/apply-event";
import { ModelSelect, modelKey, parseModelKey } from "../sessions/NewSessionDialog";
import { indexToolResults, MessageItem } from "./MessageItem";

export function ChatView() {
  const currentId = useAppState((s) => s.currentId);
  const sessions = useAppState((s) => s.sessions);
  const chats = useAppState((s) => s.chats);
  const models = useAppState((s) => s.models);
  const item = sessions.find((s) => s.meta.id === currentId);
  const chat = currentId ? (chats[currentId] ?? emptyChat()) : emptyChat();
  const toolResults = useMemo(() => indexToolResults(chat.messages), [chat.messages]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  });

  if (!currentId || !item) {
    return (
      <EmptyState
        title={
          sessions.length === 0
            ? "还没有对话。先在设置里配置模型，再新建对话。"
            : "选择左侧的一条对话开始"
        }
        action={
          sessions.length === 0 ? (
            <Button onClick={() => appStore.setView("settings")}>打开设置</Button>
          ) : undefined
        }
      />
    );
  }

  const meta = item.meta;
  const modelValue = modelKey(meta.model);
  const modelKnown = models.some((m) => modelKey(m) === modelValue);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{meta.title}</div>
          {meta.role ? (
            <div className="truncate text-xs text-ink-faint" title={meta.role}>
              {meta.role}
            </div>
          ) : null}
        </div>
        <div className="w-64">
          <ModelSelect
            value={modelValue}
            onChange={(v) => {
              const ref = parseModelKey(v);
              if (ref) void appStore.patchSession(meta.id, { model: ref });
            }}
            models={
              modelKnown
                ? models
                : [
                    ...models,
                    {
                      ...meta.model,
                      name: `${meta.model.id}（不可用）`,
                      api: "",
                      baseUrl: "",
                      reasoning: false,
                      input: ["text"],
                      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                      contextWindow: 0,
                      maxTokens: 0,
                    },
                  ]
            }
          />
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {!chat.loaded ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : chat.messages.length === 0 ? (
          <EmptyState title="说点什么开始。" />
        ) : (
          chat.messages.map((m, i) => (
            <MessageItem
              // biome-ignore lint/suspicious/noArrayIndexKey: 消息没有稳定 id，列表只追加不重排，index 仅作同毫秒去重
              key={`${m.role}-${m.timestamp}-${i}`}
              message={m}
              toolResults={toolResults}
              streaming={chat.streaming && i === chat.messages.length - 1}
            />
          ))
        )}
        {chat.streaming && Object.keys(chat.activeTools).length > 0 ? (
          <div className="mx-auto max-w-3xl px-4 text-xs text-ink-faint">
            正在执行：
            {Object.values(chat.activeTools)
              .map((t) => t.toolName)
              .join("、")}
          </div>
        ) : null}
      </div>

      <Composer
        sessionId={meta.id}
        streaming={chat.streaming}
        onSend={(text) => {
          stickToBottom.current = true;
          void appStore.sendPrompt(meta.id, text);
        }}
      />
    </div>
  );
}

function Composer({
  sessionId,
  streaming,
  onSend,
}: {
  sessionId: string;
  streaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // 切换会话时清空输入
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 sessionId 变化时清空
  useEffect(() => {
    setText("");
  }, [sessionId]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-line bg-panel p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(8, Math.max(1, text.split("\n").length))}
          placeholder={
            streaming
              ? "运行中——发送的消息会排在本轮之后"
              : "输入消息，Enter 发送，Shift+Enter 换行"
          }
        />
        {streaming ? (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => void appStore.abort(sessionId)}
            aria-label="中止"
            title="中止"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="icon"
          onClick={send}
          disabled={!text.trim()}
          aria-label="发送"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
