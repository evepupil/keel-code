import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeSchema, toolName } from "./client.js";
import { loadMcpConfig } from "./config.js";

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

describe("mcp 配置", () => {
  it("全局 + 项目合并，项目覆盖同名；损坏文件忽略", () => {
    const home = makeTempDir();
    const proj = makeTempDir();
    dirs.push(home, proj);
    writeFileSync(
      join(home.path, "mcp.json"),
      JSON.stringify({
        mcpServers: { fs: { command: "npx", args: ["a"] }, web: { type: "http", url: "http://x" } },
      }),
    );
    mkdirSync(join(proj.path, ".keel"));
    writeFileSync(
      join(proj.path, ".keel", "mcp.json"),
      JSON.stringify({ mcpServers: { fs: { command: "node", args: ["b"] } } }),
    );
    const cfg = loadMcpConfig(home.path, proj.path);
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(["fs", "web"]);
    expect((cfg.mcpServers.fs as { command: string }).command).toBe("node");
    writeFileSync(join(proj.path, ".keel", "mcp.json"), "{ broken");
    expect(Object.keys(loadMcpConfig(home.path, proj.path).mcpServers)).toEqual(["fs", "web"]);
  });
  it("工具名与 schema 归一", () => {
    expect(toolName("my-server", "read.file")).toBe("mcp__my_server__read_file");
    const s = normalizeSchema({ properties: { a: { type: "string" } } }) as {
      type: string;
      properties: unknown;
    };
    expect(s.type).toBe("object");
    expect(normalizeSchema(undefined)).toEqual({ type: "object", properties: {} });
  });
});
