// 测试用最小 MCP 服务器（stdio）：一个 echo 工具。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "echo", version: "0.0.0" });
server.registerTool(
  "echo",
  {
    description: "原样返回文本",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({ content: [{ type: "text", text: `echo: ${text}` }] }),
);
await server.connect(new StdioServerTransport());
