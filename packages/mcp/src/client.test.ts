import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "@keel-code/engine";
import { makeTempKeelHome, makeTempProject, startMockOpenAIServer } from "@keel-code/testkit";
import { describe, expect, it } from "vitest";
import { connectMcpServers } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("MCP 客户端", () => {
  it("连接 stdio 服务器，工具注册进引擎并可被模型调用", async () => {
    const mock = await startMockOpenAIServer({ models: ["mock-1"] });
    const home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1"] });
    const project = makeTempProject();
    const engine = await createEngine({ cwd: project.path, homeDir: home.path });
    let manager: Awaited<ReturnType<typeof connectMcpServers>> | undefined;
    try {
      const logs: string[] = [];
      manager = await connectMcpServers({
        engine,
        config: {
          mcpServers: {
            echo: {
              command: process.execPath,
              args: [join(here, "__fixtures__", "echo-server.mjs")],
            },
            broken: { command: process.execPath, args: ["-e", "process.exit(1)"] },
          },
        },
        log: (m) => logs.push(m),
      });
      const st = manager.status();
      expect(st.find((s) => s.name === "echo")?.connected).toBe(true);
      expect(st.find((s) => s.name === "echo")?.tools).toEqual(["mcp__echo__echo"]);
      expect(st.find((s) => s.name === "broken")?.connected).toBe(false);

      mock.enqueue(
        { toolCalls: [{ name: "mcp__echo__echo", arguments: { text: "你好" } }] },
        { text: "done" },
      );
      const session = await engine.sessions.create({
        kind: "main",
        title: "m",
        systemPrompt: "test",
      });
      await session.prompt("用 echo 工具");
      await session.waitForIdle();
      const tr = session.getMessages().find((m) => m.role === "toolResult");
      expect(tr?.role === "toolResult" && tr.toolName).toBe("mcp__echo__echo");
      expect(JSON.stringify(tr)).toContain("echo: 你好");
      // 工具定义进入了模型请求
      expect(JSON.stringify(mock.requests[0]?.tools ?? [])).toContain("mcp__echo__echo");
    } finally {
      await manager?.dispose();
      await engine.dispose();
      await mock.close();
      home.cleanup();
      project.cleanup();
    }
  }, 60_000);
});
