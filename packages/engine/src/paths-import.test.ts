import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import { importPiCredentials, resolveKeelPaths } from "./paths.js";

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

describe("importPiCredentials", () => {
  it("只补 keel 里没有的 provider，不覆盖；pi 文件不存在时静默", () => {
    const tmp = makeTempDir();
    dirs.push(tmp);
    const paths = resolveKeelPaths(tmp.path, join(tmp.path, "keel-home"));
    mkdirSync(paths.home, { recursive: true });
    writeFileSync(paths.authFile, JSON.stringify({ openai: { type: "api_key", key: "keep" } }));
    const piAuth = join(tmp.path, "pi-auth.json");
    writeFileSync(
      piAuth,
      JSON.stringify({
        deepseek: { type: "api_key", key: "ds" },
        openai: { type: "api_key", key: "pi" },
      }),
    );
    expect(importPiCredentials(paths, piAuth)).toEqual(["deepseek"]);
    const merged = JSON.parse(readFileSync(paths.authFile, "utf8")) as Record<
      string,
      { key: string }
    >;
    expect(merged.openai?.key).toBe("keep");
    expect(merged.deepseek?.key).toBe("ds");
    expect(importPiCredentials(paths, piAuth)).toEqual([]);
    expect(importPiCredentials(paths, join(tmp.path, "nope.json"))).toEqual([]);
  });
});
