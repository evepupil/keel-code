/**
 * 把引擎事件应用到一条会话的本地消息状态。纯函数，可单测。
 *
 * 规则：
 * - message_start：assistant 消息进入「流式中」；其他角色直接追加。
 * - message_update：替换流式中的那条（引擎每次都给完整的部分消息）。
 * - message_end：定稿并结束流式；若没有流式中的消息则追加。
 * - agent_start / idle：切换 streaming 标记；idle 时上层应重新拉取会话做一次校准。
 */
import type { EngineEvent, EngineMessage, SessionEntry } from "../api/types";

export interface ChatState {
  messages: EngineMessage[];
  /** keel/* 自定义条目（review 卡片等），与消息按时间合并渲染 */
  entries: SessionEntry[];
  /** 正在流式的消息在 messages 里的下标 */
  streamingIndex: number | null;
  streaming: boolean;
  loaded: boolean;
  /** 需要重新拉取（idle 后校准） */
  needsResync: boolean;
  activeTools: Record<string, { toolName: string; args: unknown }>;
}

const EMPTY_MESSAGES: ChatState["messages"] = [];
const EMPTY_ENTRIES: ChatState["entries"] = [];
const EMPTY_TOOLS: ChatState["activeTools"] = {};

export const emptyChat = (): ChatState => ({
  messages: EMPTY_MESSAGES,
  entries: EMPTY_ENTRIES,
  streamingIndex: null,
  streaming: false,
  loaded: false,
  needsResync: false,
  activeTools: EMPTY_TOOLS,
});

export function applyEngineEvent(chat: ChatState, event: EngineEvent): ChatState {
  switch (event.type) {
    case "agent_start":
      return { ...chat, streaming: true };
    case "message_start": {
      // 发送时本地已乐观插入同一条用户消息：引擎回放的同文本消息在 3 秒窗口内视为同一条
      if (event.message.role === "user") {
        const last = chat.messages.at(-1);
        if (
          last &&
          last.role === "user" &&
          Math.abs(last.timestamp - event.message.timestamp) < 3000 &&
          userText(last) === userText(event.message)
        ) {
          return { ...chat, streaming: true };
        }
      }
      const messages = [...chat.messages, event.message];
      const isAssistant = event.message.role === "assistant";
      return {
        ...chat,
        messages,
        streamingIndex: isAssistant ? messages.length - 1 : chat.streamingIndex,
        streaming: true,
      };
    }
    case "message_update": {
      if (chat.streamingIndex === null) {
        const messages = [...chat.messages, event.message];
        return { ...chat, messages, streamingIndex: messages.length - 1, streaming: true };
      }
      const messages = chat.messages.slice();
      messages[chat.streamingIndex] = event.message;
      return { ...chat, messages, streaming: true };
    }
    case "message_end": {
      if (chat.streamingIndex !== null && event.message.role === "assistant") {
        const messages = chat.messages.slice();
        messages[chat.streamingIndex] = event.message;
        return { ...chat, messages, streamingIndex: null };
      }
      // 非流式消息（工具结果等）：若最后一条不是它就追加
      const last = chat.messages.at(-1);
      if (last && sameMessage(last, event.message)) return chat;
      return { ...chat, messages: [...chat.messages, event.message] };
    }
    case "tool_execution_start":
      return {
        ...chat,
        activeTools: {
          ...chat.activeTools,
          [event.toolCallId]: { toolName: event.toolName, args: event.args },
        },
      };
    case "tool_execution_end": {
      const { [event.toolCallId]: _done, ...rest } = chat.activeTools;
      return { ...chat, activeTools: rest };
    }
    case "entry_appended": {
      if (event.entryType !== "custom" || !event.customType?.startsWith("keel/")) return chat;
      if (event.customType === "keel/meta" || event.customType === "keel/system-prompt")
        return chat;
      const entry: SessionEntry = {
        id: `${event.customType}-${Date.now()}-${chat.entries.length}`,
        customType: event.customType,
        data: event.data,
        timestamp: Date.now(),
      };
      return { ...chat, entries: [...chat.entries, entry] };
    }
    case "idle":
      return {
        ...chat,
        streaming: false,
        streamingIndex: null,
        needsResync: true,
        activeTools: {},
      };
    default:
      return chat;
  }
}

function sameMessage(a: EngineMessage, b: EngineMessage): boolean {
  if (a.role !== b.role || a.timestamp !== b.timestamp) return false;
  if (a.role === "toolResult" && b.role === "toolResult") return a.toolCallId === b.toolCallId;
  return true;
}

function userText(m: Extract<EngineMessage, { role: "user" }>): string {
  return typeof m.content === "string"
    ? m.content
    : m.content.map((p) => (p.type === "text" ? p.text : "[图片]")).join("\n");
}
