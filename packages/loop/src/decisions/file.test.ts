import { readFileSync } from "node:fs";
import { makeTempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendDecisions,
  countPendingDecisions,
  decisionsPath,
  listPendingDecisions,
  resolveDecision,
} from "./file.js";

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

describe("待决策文件", () => {
  it("追加 → 列出 → 解决（空小节被清理）", () => {
    const tmp = makeTempDir();
    dirs.push(tmp);
    appendDecisions(
      tmp.path,
      [{ issue: "A 还是 B", category: "decision", suggestion: "A/B" }],
      "登录页",
      new Date("2026-08-17T04:00:00Z"),
    );
    appendDecisions(
      tmp.path,
      [{ issue: "要不要缓存", category: "decision" }],
      "列表页",
      new Date("2026-08-17T05:00:00Z"),
    );
    expect(countPendingDecisions(tmp.path)).toBe(2);
    const list = listPendingDecisions(tmp.path);
    expect(list).toHaveLength(2);
    expect(list[0]?.section).toContain("登录页");
    expect(list[0]?.text).toContain("A 还是 B");
    expect(resolveDecision(tmp.path, list[0]?.line ?? -1)).toBe(true);
    const after = readFileSync(decisionsPath(tmp.path), "utf8");
    expect(after).not.toContain("登录页");
    expect(after).toContain("要不要缓存");
    expect(resolveDecision(tmp.path, 0)).toBe(false);
  });
});
