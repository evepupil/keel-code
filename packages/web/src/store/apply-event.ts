/**
 * 把引擎事件应用到一条会话的本地消息状态。纯函数，可单测。
 *
 * 规则：
 * - message_start：assistant 消息进入「流式中」；其他角色直接追加。
 * - message_update：替换流式中的那条（引擎每次都给完整的部分消息）。
 * - message_end：定稿并结束流式；若没有流式中的消息则追加。
 * - agent_start / idle：切换 streaming 标记；idle 时上层应重新拉取会话做一次校准。
 */
import type { EngineEvent, EngineMessage } from "../api/types";

export interface ChatState {
  messages: EngineMessage[];
  /** 正在流式的消息在 messages 里的下标 */
  streamingIndex: number | null;
  streaming: boolean;
  loaded: boolean;
  /** 需要重新拉取（idle 后校准） */
  needsResync: boolean;
  activeTools: Record<string, { toolName: string; args: unknown }>;
}

export const emptyChat = (): ChatState => ({
  messages: [],
  streamingIndex: null,
  streaming: false,
  loaded: false,
  needsResync: false,
  activeTools: {},
});

export function applyEngineEvent(chat: ChatState, event: EngineEvent): ChatState {
  switch (event.type) {
    case "agent_start":
      return { ...chat, streaming: true };
    case "message_start": {
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
