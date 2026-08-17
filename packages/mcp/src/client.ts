/**
 * MCP 客户端管理：按配置连接服务器，把每个 MCP 工具注册成引擎工具 `mcp__<server>__<tool>`。
 * 连接失败只记日志不阻塞启动；工具结果统一转成文本 / 图片内容。
 */

import type {
  Engine,
  HookScope,
  KeelToolDefinition,
  TSchema,
  Unsubscribe,
} from "@keel-code/engine";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { isHttpServer, type McpConfig, type McpServerConfig } from "./config.js";

export interface McpServerStatus {
  name: string;
  connected: boolean;
  tools: string[];
  error?: string;
}

export interface McpManager {
  status(): McpServerStatus[];
  dispose(): Promise<void>;
}

const NAME_RE = /[^a-zA-Z0-9_]/g;

/** 工具名：mcp__<server>__<tool>，只留字母数字下划线（provider 对工具名有限制）。 */
export function toolName(server: string, tool: string): string {
  return `mcp__${server.replace(NAME_RE, "_")}__${tool.replace(NAME_RE, "_")}`;
}

/** MCP 的 inputSchema 是 JSON Schema，pi 的参数校验按 JSON Schema 走；缺 type 时补成对象。 */
export function normalizeSchema(schema: unknown): TSchema {
  const s = (
    schema && typeof schema === "object" ? { ...(schema as Record<string, unknown>) } : {}
  ) as Record<string, unknown>;
  if (s.type === undefined) s.type = "object";
  if (s.type === "object" && s.properties === undefined) s.properties = {};
  return s as unknown as TSchema;
}

async function connect(cfg: McpServerConfig): Promise<Client> {
  const client = new Client({ name: "keel-code", version: "0.0.0" });
  if (isHttpServer(cfg)) {
    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: cfg.headers ? { headers: cfg.headers } : {},
    });
    await client.connect(transport);
    return client;
  }
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    env: { ...getDefaultEnvironment(), ...(cfg.env ?? {}) },
    ...(cfg.cwd ? { cwd: cfg.cwd } : {}),
    stderr: "pipe",
  });
  await client.connect(transport);
  return client;
}

function contentToText(content: unknown): {
  content: { type: "text"; text: string }[];
  isError?: boolean;
} {
  const list = Array.isArray(content) ? content : [];
  const out: { type: "text"; text: string }[] = [];
  for (const c of list) {
    const item = c as {
      type?: string;
      text?: string;
      data?: string;
      mimeType?: string;
      resource?: unknown;
    };
    if (item.type === "text" && typeof item.text === "string")
      out.push({ type: "text", text: item.text });
    else if (item.type === "image")
      out.push({
        type: "text",
        text: `[图片 ${item.mimeType ?? ""}，${(item.data ?? "").length} 字节 base64]`,
      });
    else out.push({ type: "text", text: JSON.stringify(item) });
  }
  if (out.length === 0) out.push({ type: "text", text: "（空结果）" });
  return { content: out };
}

export interface ConnectMcpOptions {
  engine: Engine;
  config: McpConfig;
  /** MCP 工具对哪些会话可见（默认 main + conversation） */
  scope?: HookScope;
  log?: (msg: string) => void;
}

/** 连接全部配置的服务器并注册工具。返回状态查询与释放函数。 */
export async function connectMcpServers(options: ConnectMcpOptions): Promise<McpManager> {
  const { engine, config } = options;
  const log = options.log ?? ((m: string) => console.error(m));
  const scope: HookScope = options.scope ?? { kinds: ["main", "conversation"] };
  const clients: { name: string; client: Client }[] = [];
  const offs: Unsubscribe[] = [];
  const statuses: McpServerStatus[] = [];

  await Promise.all(
    Object.entries(config.mcpServers).map(async ([name, cfg]) => {
      const status: McpServerStatus = { name, connected: false, tools: [] };
      statuses.push(status);
      try {
        const client = await connect(cfg);
        clients.push({ name, client });
        const { tools } = await client.listTools();
        for (const t of tools) {
          const fullName = toolName(name, t.name);
          const def: KeelToolDefinition = {
            name: fullName,
            label: `${name}: ${t.name}`,
            description: `[MCP ${name}] ${t.description ?? t.name}`,
            parameters: normalizeSchema(t.inputSchema),
            execute: async (params) => {
              const r = await client.callTool({
                name: t.name,
                arguments: (params ?? {}) as Record<string, unknown>,
              });
              const converted = contentToText((r as { content?: unknown }).content);
              return (r as { isError?: boolean }).isError
                ? { ...converted, isError: true }
                : converted;
            },
          };
          offs.push(engine.tools.register(def, scope));
          status.tools.push(fullName);
        }
        status.connected = true;
        log(`[keel-mcp] ${name}：已连接，${tools.length} 个工具`);
      } catch (e) {
        status.error = e instanceof Error ? e.message : String(e);
        log(`[keel-mcp] ${name}：连接失败——${status.error}`);
      }
    }),
  );

  return {
    status: () => statuses.map((s) => ({ ...s, tools: [...s.tools] })),
    dispose: async () => {
      for (const off of offs) off();
      await Promise.all(clients.map(({ client }) => client.close().catch(() => undefined)));
    },
  };
}
