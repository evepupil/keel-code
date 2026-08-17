import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempProject } from "@keel-code/testkit";
import { describe, expect, it } from "vitest";
import { initProject } from "./init.js";

describe("initProject", () => {
  it("创建 .keel 与 docs 骨架，二次运行全部跳过且不覆盖", () => {
    const p = makeTempProject({ files: { "docs/roadmap.md": "# 自定义\n" } });
    try {
      const r1 = initProject(p.path);
      expect(r1.created).toContain(".keel/config.json");
      expect(r1.skipped).toContain("docs/roadmap.md");
      expect(existsSync(join(p.path, ".keel/agents/README.md"))).toBe(true);
      expect(readFileSync(join(p.path, "docs/roadmap.md"), "utf8")).toBe("# 自定义\n");
      const cfg = JSON.parse(readFileSync(join(p.path, ".keel/config.json"), "utf8")) as {
        guards: { commitGate: boolean };
      };
      expect(cfg.guards.commitGate).toBe(true);
      const r2 = initProject(p.path);
      expect(r2.created).toEqual([]);
    } finally {
      p.cleanup();
    }
  });
});
