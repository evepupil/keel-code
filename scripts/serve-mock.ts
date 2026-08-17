/**
 * 本地演示 / 目验用：起一个 mock 模型服务 + keel 服务（带已构建的 Web 工作台），不需要真 key。
 * 用法：pnpm tsx scripts/serve-mock.ts [port]
 */
import { resolve } from "node:path";
import { startServer } from "@keel-code/server";
import { makeTempKeelHome, makeTempProject, startMockOpenAIServer } from "@keel-code/testkit";

const port = Number(process.argv[2] ?? 3131);
const mock = await startMockOpenAIServer({ models: ["mock-1", "mock-cheap"], defaultText: "" });
mock.onRequest((req) => {
  const last = req.messages.at(-1) as { role?: string; content?: unknown } | undefined;
  const text =
    typeof last?.content === "string"
      ? last.content
      : Array.isArray(last?.content)
        ? (last.content as { type?: string; text?: string }[])
            .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
            .join("")
        : "";
  if (last?.role === "tool") return { text: "工具跑完了，我来总结一下：一切正常。" };
  if (/写文件|write/i.test(text)) {
    return {
      toolCalls: [
        { name: "write", arguments: { path: "hello.txt", content: "hello from keel\n" } },
      ],
    };
  }
  return {
    text: `收到：「${text.slice(0, 40)}」\n\n这是 **mock** 模型的回复，用来目验界面。\n\n- 支持 markdown\n- \`代码\` 也行\n\n\`\`\`ts\nconst x = 1;\n\`\`\``,
  };
});
const home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1", "mock-cheap"] });
const project = makeTempProject({ git: false, files: { "README.md": "# demo project\n" } });
const server = await startServer({
  cwd: project.path,
  homeDir: home.path,
  port,
  staticDir: resolve(import.meta.dirname, "..", "packages", "web", "dist"),
  version: "dev-mock",
});
console.log(`mock 模型：${mock.baseUrl}`);
console.log(`临时项目：${project.path}`);
console.log(`工作台：${server.url}`);
const shutdown = async () => {
  await server.close();
  await mock.close();
  home.cleanup();
  project.cleanup();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
