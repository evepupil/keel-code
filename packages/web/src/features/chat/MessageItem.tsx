import { AlertCircle, Brain, Check, Copy, Wrench } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EngineMessage } from "../../api/types";
import { StatusDot } from "../../design-system/components/dot";
import { IconButton } from "../../design-system/components/icon-button";
import { Badge } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";
import type { AssistantMeta } from "../composer/stats";

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
  meta,
}: {
  message: EngineMessage;
  toolResults: Map<string, ToolResult>;
  streaming: boolean;
  /** assistant 消息结束后的统计（悬停显示） */
  meta?: AssistantMeta;
}) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} />;
    case "assistant":
      return (
        <AssistantMessage
          message={message}
          toolResults={toolResults}
          streaming={streaming}
          meta={meta}
        />
      );
    case "custom":
      return message.display ? (
        <div className="px-5 py-1 text-xs text-ink-faint">{message.content}</div>
      ) : null;
    default:
      // toolResult 已配对进 assistant 的工具行
      return null;
  }
}

function UserMessage({ message }: { message: Extract<EngineMessage, { role: "user" }> }) {
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content.map((p) => (p.type === "text" ? p.text : "[图片]")).join("\n");
  return (
    <div className="flex justify-end px-5 py-1.5">
      <div className="max-w-[78%] whitespace-pre-wrap rounded-[14px] rounded-br-sm bg-panel-2 px-3 py-2 text-sm">
        {text}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  toolResults,
  streaming,
  meta,
}: {
  message: Extract<EngineMessage, { role: "assistant" }>;
  toolResults: Map<string, ToolResult>;
  streaming: boolean;
  meta?: AssistantMeta;
}) {
  const [copied, setCopied] = useState(false);
  const plainText = message.content
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用就算了
    }
  };

  return (
    <div className="group/msg space-y-2 px-5">
      {message.content.map((part, i) => {
        const key = `${message.timestamp}-${i}`;
        if (part.type === "thinking") return <ThinkingRow key={key} text={part.thinking} />;
        if (part.type === "text") {
          return part.text ? (
            <div key={key} className="prose-keel text-sm">
              <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
            </div>
          ) : null;
        }
        return (
          <ToolRow
            key={key}
            name={part.name}
            args={part.arguments}
            result={toolResults.get(part.id)}
            pending={streaming && !toolResults.has(part.id)}
          />
        );
      })}
      {streaming ? (
        <span className="animate-blink ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 bg-ink" />
      ) : null}
      {message.stopReason === "error" || message.errorMessage ? (
        <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{message.errorMessage ?? "模型返回错误"}</span>
        </div>
      ) : null}
      {message.stopReason === "aborted" ? <Badge tone="warn">已中止</Badge> : null}
      {!streaming && (meta || plainText) ? (
        <div className="flex h-6 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
          {plainText ? (
            <IconButton size="sm" title="复制" onClick={() => void copy()}>
              {copied ? <Check className="text-ok" /> : <Copy />}
            </IconButton>
          ) : null}
          {meta ? (
            <span className="ml-1.5 text-[11.5px] text-ink-faint">{formatMeta(meta)}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatMeta(meta: AssistantMeta): string {
  const t = new Date(meta.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const dur =
    meta.durationMs >= 60_000
      ? `${Math.floor(meta.durationMs / 60_000)}分${Math.round((meta.durationMs % 60_000) / 1000)}秒`
      : `${Math.round(meta.durationMs / 1000)}秒`;
  const speed = meta.tokPerSec !== null ? ` · ${meta.tokPerSec} tok/s` : "";
  return `${t} · 用时 ${dur}${speed} · ${meta.outputLabel} tok`;
}

function ThinkingRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        className="flex h-[30px] w-full items-center gap-2 px-2.5 text-left text-[12.5px] text-ink-muted hover:bg-panel-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        思考过程
      </button>
      {open ? (
        <div className="border-t border-line px-3 py-2 text-xs leading-5 whitespace-pre-wrap text-ink-muted">
          {text}
        </div>
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

function ToolRow({
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
  return (
    <div className={cn("rounded-md border border-line", result?.isError && "border-danger/40")}>
      <button
        type="button"
        className="flex h-[30px] w-full items-center gap-2 px-2.5 text-left text-[12.5px] hover:bg-panel-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <span className="shrink-0 font-medium">{name}</span>
        <code className="min-w-0 flex-1 truncate text-ink-muted">{summarizeArgs(args)}</code>
        {result?.isError ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-danger">失败</span>
        ) : pending ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-accent">
            <StatusDot state="run" />
            运行中
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-ok">
            <Check className="h-3 w-3" />
            完成
          </span>
        )}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-line px-2.5 py-2 text-xs">
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
