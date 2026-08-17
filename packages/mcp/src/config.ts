import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 沿用 Claude Code 的 mcp.json 形态：{ "mcpServers": { name: {...} } }，用户可以直接照抄现有配置。 */
export interface McpStdioServer {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}
export interface McpHttpServer {
  type: "http" | "streamable-http" | "sse";
  url: string;
  headers?: Record<string, string>;
}
export type McpServerConfig = McpStdioServer | McpHttpServer;

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export function isHttpServer(c: McpServerConfig): c is McpHttpServer {
  return "url" in c && typeof c.url === "string";
}

function readOne(file: string): Record<string, McpServerConfig> {
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<McpConfig>;
    return raw.mcpServers && typeof raw.mcpServers === "object" ? raw.mcpServers : {};
  } catch {
    return {};
  }
}

/** 全局（~/.keel/mcp.json）+ 项目（<cwd>/.keel/mcp.json）合并，项目覆盖同名。 */
export function loadMcpConfig(keelHome: string, cwd: string): McpConfig {
  return {
    mcpServers: {
      ...readOne(join(keelHome, "mcp.json")),
      ...readOne(join(cwd, ".keel", "mcp.json")),
    },
  };
}
