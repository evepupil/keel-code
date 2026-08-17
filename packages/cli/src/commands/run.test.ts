import { makeTempKeelHome, makeTempProject, startMockOpenAIServer } from "@keel-code/testkit";
import { describe, expect, it } from "vitest";
import { runHeadless } from "./run.js";

describe("keel run（无头）", () => {
  it("主对话跑一个任务，文本流到 stdout，空闲退出", async () => {
    const mock = await startMockOpenAIServer({ models: ["mock-1"] });
    const home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1"] });
    const project = makeTempProject({ files: { "README.md": "# p\n" } });
    let out = "";
    let err = "";
    try {
      mock.enqueue(
        { toolCalls: [{ name: "write", arguments: { path: "note.txt", content: "hi\n" } }] },
        { text: "写好了。" },
      );
      const r = await runHeadless({
        cwd: project.path,
        homeDir: home.path,
        task: "写个 note.txt",
        out: (t) => {
          out += t;
        },
        err: (t) => {
          err += t;
        },
        timeoutMs: 20_000,
      });
      expect(r.finished).toBe("idle");
      expect(r.toolCalls).toBe(1);
      expect(out).toContain("写好了");
      expect(err).toContain("[工具] write");
      expect(err).toContain("完成");
    } finally {
      await mock.close();
      home.cleanup();
      project.cleanup();
    }
  });
});
