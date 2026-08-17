import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProjectDir, WorkspaceRegistry, workspaceIdOf } from "./registry.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "keel-ws-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("WorkspaceRegistry", () => {
  it("加入 / 去重 / 按最近打开排序 / 移除 / 坏文件按空处理", () => {
    const file = join(dir, "workspaces.json");
    const a = join(dir, "a");
    const b = join(dir, "b");
    mkdirSync(a);
    mkdirSync(b);
    const reg = new WorkspaceRegistry(file);
    expect(reg.list()).toEqual([]);
    const ra = reg.add(a, undefined, new Date("2026-01-01T00:00:00Z"));
    const rb = reg.add(b, "乙", new Date("2026-01-02T00:00:00Z"));
    expect(ra.id).toBe(workspaceIdOf(a));
    expect(rb.name).toBe("乙");
    expect(reg.list().map((w) => w.id)).toEqual([rb.id, ra.id]);
    // 再加 a：不重复，lastOpenedAt 更新并排到前面
    reg.add(a, undefined, new Date("2026-01-03T00:00:00Z"));
    expect(reg.list().map((w) => w.id)).toEqual([ra.id, rb.id]);
    expect(reg.list()).toHaveLength(2);
    // 目录不存在报错
    expect(() => reg.add(join(dir, "nope"))).toThrow(/目录不存在/);
    expect(reg.remove(rb.id)).toBe(true);
    expect(reg.remove(rb.id)).toBe(false);
    expect(reg.get(ra.id)?.path).toBe(a);
    writeFileSync(file, "{not json");
    expect(reg.list()).toEqual([]);
  });

  it("isProjectDir：有 .git 或 .keel 才算", () => {
    const p = join(dir, "p");
    mkdirSync(p);
    expect(isProjectDir(p)).toBe(false);
    mkdirSync(join(p, ".keel"));
    expect(isProjectDir(p)).toBe(true);
  });
});
