import { describe, expect, it } from "vitest";
import { isSafeCommand, needsApproval } from "./approvals.js";

describe("审批判定", () => {
  it("安全前缀放行，管道 / 链式不放", () => {
    expect(isSafeCommand("git status")).toBe(true);
    expect(isSafeCommand("git diff HEAD -- src")).toBe(true);
    expect(isSafeCommand("pnpm test")).toBe(true);
    expect(isSafeCommand("rm -rf node_modules")).toBe(false);
    expect(isSafeCommand("git status && rm -rf x")).toBe(false);
    expect(isSafeCommand("git status | head")).toBe(true);
    expect(isSafeCommand("cat a.txt > b.txt")).toBe(false);
    expect(isSafeCommand("make build", ["make "])).toBe(true);
  });
  it("三档", () => {
    expect(needsApproval("yolo", "bash", { command: "rm -rf x" }, [])).toBe(false);
    expect(needsApproval("edits", "bash", { command: "rm -rf x" }, [])).toBe(true);
    expect(needsApproval("edits", "bash", { command: "git status" }, [])).toBe(false);
    expect(needsApproval("edits", "write", { path: "a.ts" }, [])).toBe(false);
    expect(needsApproval("ask", "write", { path: "a.ts" }, [])).toBe(true);
    expect(needsApproval("ask", "read", { path: "a.ts" }, [])).toBe(false);
  });
});
