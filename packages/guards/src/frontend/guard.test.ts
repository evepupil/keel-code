import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import { collectPaths, isBusinessPagePath, judgeFrontendWrite } from "./guard.js";

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

describe("isBusinessPagePath", () => {
  it("识别 pages / views / app 路由页，排除设计系统目录", () => {
    expect(isBusinessPagePath("src/pages/index.tsx")).toBe(true);
    expect(isBusinessPagePath("src/views/Home.vue")).toBe(true);
    expect(isBusinessPagePath("app/dashboard/page.tsx")).toBe(true);
    expect(isBusinessPagePath("src/components/ui/Button.tsx")).toBe(false);
    expect(isBusinessPagePath("src/styles/tokens.ts")).toBe(false);
    expect(isBusinessPagePath("src/lib/util.ts")).toBe(false);
    expect(isBusinessPagePath(["src", "pages", "a.tsx"].join("\\"))).toBe(true);
  });
});

describe("judgeFrontendWrite", () => {
  it("业务页 + 无设计系统 → 拒；组件路径 → 放；建标志后 → 放；非写入工具 → 放", () => {
    const tmp = makeTempDir();
    dirs.push(tmp);
    const cwd = tmp.path;
    const page = { toolName: "write", input: { path: "src/pages/index.tsx", content: "x" }, cwd };
    expect(judgeFrontendWrite(page)).toMatch(/拦截/);
    expect(
      judgeFrontendWrite({ ...page, input: { path: "src/components/ui/Button.tsx" } }),
    ).toBeUndefined();
    expect(judgeFrontendWrite({ ...page, toolName: "read" })).toBeUndefined();
    mkdirSync(join(cwd, "src", "styles"), { recursive: true });
    writeFileSync(join(cwd, "src", "styles", "tokens.ts"), "export const t = 1;");
    expect(judgeFrontendWrite(page)).toBeUndefined();
  });
  it("collectPaths 找常见字段", () => {
    expect(collectPaths({ file_path: "a/b.ts" })).toEqual(["a/b.ts"]);
    expect(collectPaths({ foo: "no-slash", bar: "x/y.ts" })).toEqual(["x/y.ts"]);
  });
});
