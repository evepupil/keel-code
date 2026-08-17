import { describe, expect, it } from "vitest";
import { assembleSystemPrompt, BASE_SECTIONS } from "./assemble.js";

describe("assembleSystemPrompt", () => {
  it("普通对话：全部 base 节 + 职责，无调度段", () => {
    const p = assembleSystemPrompt({ kind: "conversation", role: "负责整个前端" });
    for (const s of BASE_SECTIONS) expect(p).toContain(`## ${s.title}`);
    expect(p).toContain("## 职责\n\n负责整个前端");
    expect(p).not.toContain("主对话职责");
  });
  it("主对话：多一段调度职责，且能带名册与约束", () => {
    const p = assembleSystemPrompt({
      kind: "main",
      rosterDigest: "- 前端对话（新鲜）",
      constraints: ["commitGate 已开启"],
    });
    expect(p).toContain("主对话职责");
    expect(p).toContain("keel_providers_probe");
    expect(p).toContain("## 名册");
    expect(p).toContain("- commitGate 已开启");
  });
  it("子 agent：精简 base + 任务", () => {
    const p = assembleSystemPrompt({ kind: "subagent", task: "复核本批实现" });
    expect(p).toContain("## 任务\n\n复核本批实现");
    expect(p).not.toContain("## 对话协作");
    expect(p).toContain("## 方法论硬规则");
  });
});
