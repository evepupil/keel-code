/**
 * keel ↔ pi 的桥：把 keel 的钩子总线和工具定义翻译成 pi 的内联扩展与 ToolDefinition。
 */
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { HookBus } from "../hooks/bus.js";
import type { KeelToolDefinition, SessionMeta, ToolResultContent } from "../types.js";

export interface BridgeContext {
  cwd: string;
  sessionId: string;
  getMeta(): SessionMeta;
}

/** 生成绑定到某条会话的 pi 内联扩展工厂。 */
export function createKeelExtension(bus: HookBus, ctx: BridgeContext) {
  return (pi: ExtensionAPI): void => {
    pi.on("tool_call", async (event) => {
      const input = event.input as Record<string, unknown>;
      const r = await bus.runToolCall({
        sessionId: ctx.sessionId,
        meta: ctx.getMeta(),
        cwd: ctx.cwd,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input,
      });
      if (r.block) return { block: true, reason: r.reason };
      return undefined;
    });

    pi.on("tool_result", async (event) => {
      await bus.runToolResult({
        sessionId: ctx.sessionId,
        meta: ctx.getMeta(),
        cwd: ctx.cwd,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
        content: event.content.map(convertContentOut),
        isError: event.isError,
      });
      return undefined;
    });

    pi.on("before_agent_start", async (event) => {
      const r = await bus.runBeforeAgentStart({
        sessionId: ctx.sessionId,
        meta: ctx.getMeta(),
        cwd: ctx.cwd,
        prompt: event.prompt,
        systemPrompt: event.systemPrompt,
      });
      if (r.systemPrompt !== undefined) return { systemPrompt: r.systemPrompt };
      return undefined;
    });
  };
}

function convertContentOut(
  c: TextContent | ImageContent,
): { type: "text"; text: string } | { type: "image"; mimeType: string; data: string } {
  if (c.type === "text") return { type: "text", text: c.text };
  return { type: "image", mimeType: c.mimeType, data: c.data };
}

function convertContentIn(c: ToolResultContent["content"][number]): TextContent | ImageContent {
  if (c.type === "text") return { type: "text", text: c.text };
  return { type: "image", mimeType: c.mimeType, data: c.data };
}

/** keel 工具定义 → pi ToolDefinition。执行时注入会话上下文。 */
export function toPiTool(def: KeelToolDefinition, ctx: BridgeContext): ToolDefinition {
  const tool = defineTool({
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    ...(def.promptSnippet ? { promptSnippet: def.promptSnippet } : {}),
    async execute(_toolCallId, params, signal) {
      const result = await def.execute(params, {
        sessionId: ctx.sessionId,
        meta: ctx.getMeta(),
        cwd: ctx.cwd,
        signal,
      });
      const normalized: ToolResultContent =
        typeof result === "string" ? { content: [{ type: "text", text: result }] } : result;
      if (normalized.isError) {
        const text = normalized.content
          .map((c) => (c.type === "text" ? c.text : "[image]"))
          .join("\n");
        throw new Error(text || `${def.name} 执行失败`);
      }
      return {
        content: normalized.content.map(convertContentIn),
        details: normalized.details,
      };
    },
  });
  return tool as ToolDefinition;
}
