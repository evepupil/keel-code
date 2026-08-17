import { AlertCircle, ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EngineMessage } from "../../api/types";
import { Badge } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";

type ToolResult = Extract<EngineMessage, { role: "toolResult" }>;

/** 把工具结果消息按 toolCallId 建索引，渲染 assistant 的 toolCall 时配对显示。 */
export function indexToolResults(messages: EngineMessage[]): Map<string, ToolResult> {
  const map = new Map<string, ToolResult>();
  for (const m of messages) if (m.role === "toolResult") map.set(m.toolCallId, m);
  return map;
}

export function MessageItem({
  message,
  toolResults,
  streaming,
}: {
  message: EngineMessage;
  toolResults: Map<string, ToolResult>;
  streaming: boolean;
}) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} />;
    case "assistant":
      return <AssistantMessage message={message} toolResults={toolResults} streaming={streaming} />;
    case "custom":
      return message.display ? (
        <div className="mx-auto max-w-3xl px-4 py-1 text-xs text-ink-faint">{message.content}</div>
      ) : null;
    default:
      // toolResult 已配对进 assistant 的工具卡片
      return null;
  }
}

function UserMessage({ message }: { message: Extract<EngineMessage, { role: "user" }> }) {
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content.map((p) => (p.type === "text" ? p.text : "[图片]")).join("\n");
  return (
    <div className="mx-auto flex max-w-3xl justify-end px-4 py-2">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-accent-soft px-3 py-2 text-sm">
        {text}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  toolResults,
  streaming,
}: {
  message: Extract<EngineMessage, { role: "assistant" }>;
  toolResults: Map<string, ToolResult>;
  streaming: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-2 px-4 py-2">
      {message.content.map((part, i) => {
        const key = `${message.timestamp}-${i}`;
        if (part.type === "thinking") return <ThinkingBlock key={key} text={part.thinking} />;
        if (part.type === "text") {
          return part.text ? (
            <div key={key} className="prose-keel text-sm">
              <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
            </div>
          ) : null;
        }
        return (
          <ToolCallCard
            key={key}
            name={part.name}
            args={part.arguments}
            result={toolResults.get(part.id)}
            pending={streaming && !toolResults.has(part.id)}
          />
        );
      })}
      {message.stopReason === "error" || message.errorMessage ? (
        <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{message.errorMessage ?? "模型返回错误"}</span>
        </div>
      ) : null}
      {message.stopReason === "aborted" ? <Badge tone="warn">已中止</Badge> : null}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="text-xs text-ink-muted">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-ink"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        思考过程
      </button>
      {open ? (
        <div className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-2 leading-5">{text}</div>
      ) : null}
    </div>
  );
}

const ARG_PREVIEW_KEYS = ["path", "command", "pattern", "text", "title"];

function summarizeArgs(args: Record<string, unknown>): string {
  for (const k of ARG_PREVIEW_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.length > 100 ? `${v.slice(0, 100)}…` : v;
  }
  const s = JSON.stringify(args);
  return s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

export function ToolCallCard({
  name,
  args,
  result,
  pending,
}: {
  name: string;
  args: Record<string, unknown>;
  result: ToolResult | undefined;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const resultText = result?.content.map((c) => (c.type === "text" ? c.text : "[图片]")).join("\n");
  const tone = result?.isError ? "danger" : pending ? "accent" : "neutral";
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-panel text-xs",
        result?.isError && "border-danger/40",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-panel-2"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        <Wrench className="h-3 w-3 shrink-0 text-ink-faint" />
        <span className="font-mono font-medium">{name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">
          {summarizeArgs(args)}
        </span>
        <Badge tone={tone}>{result?.isError ? "失败" : pending ? "执行中" : "完成"}</Badge>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-line px-2.5 py-2">
          <div>
            <div className="mb-1 text-[11px] text-ink-faint">参数</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {result ? (
            <div>
              <div className="mb-1 text-[11px] text-ink-faint">结果</div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono">
                {resultText || "（空）"}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
