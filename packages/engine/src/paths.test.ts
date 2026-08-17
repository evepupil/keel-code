import { describe, expect, it } from "vitest";
import { projectDirName, resolveKeelPaths } from "./paths.js";

describe("projectDirName", () => {
  it("同一路径稳定，不同路径不同", () => {
    const a = projectDirName("D:/x/my-proj");
    expect(a).toBe(projectDirName("D:/x/my-proj"));
    expect(a).not.toBe(projectDirName("D:/x/other"));
    expect(a).toMatch(/^my-proj-[0-9a-f]{12}$/);
  });
  it("清洗奇怪字符", () => {
    expect(projectDirName("D:/x/我的 项目!!")).toMatch(/^我的-项目-[0-9a-f]{12}$/);
  });
});

describe("resolveKeelPaths", () => {
  it("尊重 homeDir，并把项目会话目录放在 sessions 下", () => {
    const p = resolveKeelPaths("D:/x/my-proj", "D:/home/.keel");
    expect(p.home.replace(/\\/g, "/")).toBe("D:/home/.keel");
    expect(p.authFile.replace(/\\/g, "/")).toBe("D:/home/.keel/auth.json");
    expect(p.projectSessionsDir.replace(/\\/g, "/")).toMatch(
      /^D:\/home\/.keel\/sessions\/my-proj-/,
    );
    expect(p.projectIndexFile.endsWith("index.json")).toBe(true);
  });
});
