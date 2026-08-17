import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSessionEvent, SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  CustomMessage,
  EngineEvent,
  EngineMessage,
  ImagePart,
  MessageDelta,
  TextPart,
  ThinkingPart,
  ToolCallPart,
  ToolResultMessage,
  UsageInfo,
  UserMessage,
} from "../types.js";

const EMPTY_USAGE: UsageInfo = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  costTotal: 0,
};

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec | undefined {
  return v && typeof v === "object" ? (v as Rec) : undefined;
}

function convertParts(parts: unknown): (TextPart | ThinkingPart | ToolCallPart | ImagePart)[] {
  if (!Array.isArray(parts)) return [];
  const out: (TextPart | ThinkingPart | ToolCallPart | ImagePart)[] = [];
  for (const raw of parts) {
    const p = asRecord(raw);
    if (!p) continue;
    switch (p.type) {
      case "text":
        out.push({ type: "text", text: String(p.text ?? "") });
        break;
      case "thinking": {
        const part: ThinkingPart = { type: "thinking", thinking: String(p.thinking ?? "") };
        if (p.redacted === true) part.redacted = true;
        out.push(part);
        break;
      }
      case "toolCall":
        out.push({
          type: "toolCall",
          id: String(p.id ?? ""),
          name: String(p.name ?? ""),
          arguments: asRecord(p.arguments) ?? {},
        });
        break;
      case "image":
        out.push({
          type: "image",
          mimeType: String(p.mimeType ?? "image/png"),
          data: String(p.data ?? ""),
        });
        break;
      default:
        break;
    }
  }
  return out;
}

export function convertUsage(raw: unknown): UsageInfo {
  const u = asRecord(raw);
  if (!u) return { ...EMPTY_USAGE };
  const cost = asRecord(u.cost);
  return {
    input: Number(u.input ?? 0),
    output: Number(u.output ?? 0),
    cacheRead: Number(u.cacheRead ?? 0),
    cacheWrite: Number(u.cacheWrite ?? 0),
    totalTokens: Number(u.totalTokens ?? 0),
    costTotal: Number(cost?.total ?? 0),
  };
}

/** pi 消息 → 引擎消息。未知角色返回 undefined（例如 bash 执行等 pi 内部消息）。 */
export function convertMessage(raw: AgentMessage): EngineMessage | undefined {
  const m = asRecord(raw);
  if (!m) return undefined;
  const timestamp = Number(m.timestamp ?? Date.now());
  switch (m.role) {
    case "user": {
      const content =
        typeof m.content === "string"
          ? m.content
          : (convertParts(m.content).filter(
              (p): p is TextPart | ImagePart => p.type === "text" || p.type === "image",
            ) as (TextPart | ImagePart)[]);
      const msg: UserMessage = { role: "user", content, timestamp };
      return msg;
    }
    case "assistant": {
      const msg: AssistantMessage = {
        role: "assistant",
        content: convertParts(m.content).filter(
          (p): p is TextPart | ThinkingPart | ToolCallPart => p.type !== "image",
        ),
        provider: String(m.provider ?? ""),
        model: String(m.model ?? ""),
        usage: convertUsage(m.usage),
        stopReason: (m.stopReason as AssistantMessage["stopReason"]) ?? "stop",
        timestamp,
      };
      if (typeof m.errorMessage === "string") msg.errorMessage = m.errorMessage;
      return msg;
    }
    case "toolResult": {
      const msg: ToolResultMessage = {
        role: "toolResult",
        toolCallId: String(m.toolCallId ?? ""),
        toolName: String(m.toolName ?? ""),
        content: convertParts(m.content).filter(
          (p): p is TextPart | ImagePart => p.type === "text" || p.type === "image",
        ),
        isError: m.isError === true,
        timestamp,
      };
      if (m.details !== undefined) msg.details = m.details;
      return msg;
    }
    case "custom": {
      const content =
        typeof m.content === "string"
          ? m.content
          : convertParts(m.content)
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
      const msg: CustomMessage = {
        role: "custom",
        customType: String(m.customType ?? ""),
        content,
        display: m.display !== false,
        timestamp,
      };
      if (m.details !== undefined) msg.details = m.details;
      return msg;
    }
    default:
      return undefined;
  }
}

export function convertMessages(list: readonly AgentMessage[]): EngineMessage[] {
  const out: EngineMessage[] = [];
  for (const m of list) {
    const c = convertMessage(m);
    if (c) out.push(c);
  }
  return out;
}

function convertDelta(ev: unknown): MessageDelta {
  const e = asRecord(ev);
  if (!e) return { kind: "other" };
  const idx = Number(e.contentIndex ?? 0);
  switch (e.type) {
    case "text_delta":
      return { kind: "text", text: String(e.delta ?? ""), contentIndex: idx };
    case "thinking_delta":
      return { kind: "thinking", text: String(e.delta ?? ""), contentIndex: idx };
    case "toolcall_start":
    case "toolcall_delta":
    case "toolcall_end":
      return { kind: "toolcall", contentIndex: idx };
    default:
      return { kind: "other" };
  }
}

/** pi 会话事件 → 引擎事件。返回 undefined 表示不对外暴露。 */
export function convertEvent(ev: AgentSessionEvent): EngineEvent | undefined {
  switch (ev.type) {
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end", messages: convertMessages(ev.messages) };
    case "turn_start":
      return { type: "turn_start" };
    case "turn_end": {
      const message = convertMessage(ev.message);
      return message ? { type: "turn_end", message } : undefined;
    }
    case "message_start": {
      const message = convertMessage(ev.message);
      return message ? { type: "message_start", message } : undefined;
    }
    case "message_update": {
      const message = convertMessage(ev.message);
      return message
        ? { type: "message_update", message, delta: convertDelta(ev.assistantMessageEvent) }
        : undefined;
    }
    case "message_end": {
      const message = convertMessage(ev.message);
      return message ? { type: "message_end", message } : undefined;
    }
    case "tool_execution_start":
      return {
        type: "tool_execution_start",
        toolCallId: ev.toolCallId,
        toolName: ev.toolName,
        args: ev.args,
      };
    case "tool_execution_end":
      return {
        type: "tool_execution_end",
        toolCallId: ev.toolCallId,
        toolName: ev.toolName,
        result: ev.result,
        isError: ev.isError,
      };
    case "entry_appended":
      return convertEntryAppended(ev.entry);
    case "compaction_start":
      return { type: "compaction_start", reason: ev.reason };
    case "compaction_end": {
      const out: EngineEvent = {
        type: "compaction_end",
        reason: ev.reason,
        aborted: ev.aborted,
      };
      if (ev.errorMessage) out.errorMessage = ev.errorMessage;
      return out;
    }
    case "auto_retry_start":
      return {
        type: "retry",
        attempt: ev.attempt,
        maxAttempts: ev.maxAttempts,
        delayMs: ev.delayMs,
        errorMessage: ev.errorMessage,
      };
    case "thinking_level_changed":
      return { type: "thinking_level_changed", level: ev.level };
    case "agent_settled":
      return { type: "idle" };
    default:
      return undefined;
  }
}

function convertEntryAppended(entry: SessionEntry): EngineEvent | undefined {
  const e = entry as unknown as Rec;
  if (e.type === "custom") {
    return {
      type: "entry_appended",
      entryType: "custom",
      customType: String(e.customType ?? ""),
      data: e.data,
    };
  }
  if (e.type === "model_change") {
    return {
      type: "model_changed",
      model: { provider: String(e.provider ?? ""), id: String(e.modelId ?? "") },
    };
  }
  return { type: "entry_appended", entryType: String(e.type ?? "") };
}
