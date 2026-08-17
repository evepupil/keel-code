import { describe, expect, it } from "vitest";
import { extractCommand, isGitCommit, judgeReviewCredit } from "./gate.js";

describe("isGitCommit", () => {
  it("识别各种写法", () => {
    expect(isGitCommit("git commit -m x")).toBe(true);
    expect(isGitCommit("git add -A && git commit -q -m 'x'")).toBe(true);
    expect(isGitCommit("git -c core.quotepath=off commit -m x")).toBe(true);
    expect(isGitCommit("git status")).toBe(false);
    expect(isGitCommit("echo commit")).toBe(false);
  });
  it("extractCommand", () => {
    expect(extractCommand({ command: "ls" })).toBe("ls");
    expect(extractCommand({ path: "a" })).toBeUndefined();
  });
});

describe("judgeReviewCredit", () => {
  it("无记录拒；树不一致拒；一致放", () => {
    expect(
      judgeReviewCredit({ reviewState: { roundsSincePass: 0, lastPass: null }, currentTree: "a" }),
    ).toMatch(/没有 review 通过记录/);
    const pass = { tree: "a", at: "t", batch: "b", sessionId: "s" };
    expect(
      judgeReviewCredit({ reviewState: { roundsSincePass: 0, lastPass: pass }, currentTree: "b" }),
    ).toMatch(/又被修改/);
    expect(
      judgeReviewCredit({ reviewState: { roundsSincePass: 0, lastPass: pass }, currentTree: "a" }),
    ).toBeUndefined();
  });
});

describe("docs-only", () => {
  it("isDocPath / isDocsOnlyChange", async () => {
    const { isDocPath, isDocsOnlyChange } = await import("./docs-only.js");
    expect(isDocPath("docs/roadmap.md")).toBe(true);
    expect(isDocPath(".keel/config.json")).toBe(true);
    expect(isDocPath("README.md")).toBe(true);
    expect(isDocPath("src/a.ts")).toBe(false);
    expect(isDocsOnlyChange(["docs/a.md", "README.md"])).toBe(true);
    expect(isDocsOnlyChange(["docs/a.md", "src/a.ts"])).toBe(false);
    expect(isDocsOnlyChange([])).toBe(true);
  });
});
