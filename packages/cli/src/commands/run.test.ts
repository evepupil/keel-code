import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  it("完整无头流程：写文件 → review 通过 → 提交 → 后台文档任务", async () => {
    const mock = await startMockOpenAIServer({ models: ["mock-1"] });
    const home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1"] });
    const project = makeTempProject({ git: true, files: { "README.md": "# headless\n" } });
    let out = "";
    let err = "";
    mock.onRequest((req) => {
      const toolNames = (req.tools ?? []).map(
        (tool) => (tool as { function?: { name?: string } }).function?.name,
      );
      const lastRole = (req.messages.at(-1) as { role?: string })?.role;
      if (toolNames.includes("submit_result")) {
        if (lastRole === "tool") return { text: "review submitted" };
        return {
          toolCalls: [
            {
              name: "submit_result",
              arguments: { verdict: "pass", summary: "headless review passed", findings: [] },
            },
          ],
        };
      }
      if (!toolNames.includes("keel_batch_report")) return { text: "background prune complete" };
      const toolCount = req.messages.filter((m) => (m as { role?: string }).role === "tool").length;
      if (toolCount === 0) {
        return {
          toolCalls: [
            {
              name: "write",
              arguments: { path: "src/result.ts", content: "export const result = 1;\n" },
            },
          ],
        };
      }
      if (toolCount === 1) {
        return {
          toolCalls: [
            {
              name: "keel_batch_report",
              arguments: { batch: "headless result", scope: "src/result.ts" },
            },
          ],
        };
      }
      if (toolCount === 2) {
        return {
          toolCalls: [
            {
              name: "bash",
              arguments: { command: "git add -A && git commit -q -m 'headless flow'" },
            },
          ],
        };
      }
      return { text: "headless flow complete" };
    });
    try {
      const result = await runHeadless({
        cwd: project.path,
        homeDir: home.path,
        task: "complete the headless flow",
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
        timeoutMs: 20_000,
      });
      expect(result.finished).toBe("idle");
      expect(result.toolCalls).toBe(3);
      expect(result.text).toContain("headless flow complete");
      expect(readFileSync(`${project.path}/src/result.ts`, "utf8")).toContain("result = 1");
      expect(
        execFileSync("git", ["log", "-1", "--format=%s"], {
          cwd: project.path,
          encoding: "utf8",
        }).trim(),
      ).toBe("headless flow");
      expect(out).toContain("headless flow complete");
      expect(err).toContain("[工具] write");
      expect(err).toContain("[工具] keel_batch_report");
      expect(err).toContain("[工具] bash");
    } finally {
      await mock.close();
      home.cleanup();
      project.cleanup();
    }
  });
});
