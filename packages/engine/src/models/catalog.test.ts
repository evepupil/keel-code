import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import {
  backfillDefaultHeaders,
  catalogOf,
  emptyModelsFile,
  readModelsFile,
  removeCatalog,
  upsertCatalog,
  validateProviderId,
  visibleModelsOf,
  writeModelsFile,
} from "./catalog.js";

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

describe("validateProviderId", () => {
  it("小写字母开头，字母数字连字符下划线", () => {
    expect(validateProviderId("acme-gateway")).toBeUndefined();
    expect(validateProviderId("openai")).toBeUndefined();
    expect(validateProviderId("a_1")).toBeUndefined();
    expect(validateProviderId("Acme")).toBeDefined();
    expect(validateProviderId("1acme")).toBeDefined();
    expect(validateProviderId("")).toBeDefined();
  });
});

describe("models.json 读写", () => {
  it("文件不存在 / 坏 JSON 都当空目录", () => {
    const tmp = makeTempDir();
    dirs.push(tmp);
    expect(readModelsFile(join(tmp.path, "nope.json"))).toEqual(emptyModelsFile());
    const bad = join(tmp.path, "bad.json");
    writeModelsFile(bad, emptyModelsFile());
    expect(readModelsFile(bad).providers).toEqual({});
  });

  it("upsert 合并字段、remove 删掉、密钥不落盘", () => {
    const file = upsertCatalog(emptyModelsFile(), "acme", {
      name: "Acme",
      baseUrl: "https://gw.example/v1",
      api: "openai-completions",
      models: [{ id: "fast", name: "Fast", contextWindow: 128000, maxTokens: 8192 }],
    });
    expect(catalogOf(file, "acme")?.models?.[0]?.id).toBe("fast");
    const next = upsertCatalog(file, "acme", { name: "Acme GW", models: [{ id: "pro" }] });
    expect(next.providers.acme?.name).toBe("Acme GW");
    expect(next.providers.acme?.baseUrl).toBe("https://gw.example/v1");
    expect(next.providers.acme?.models?.map((m) => m.id)).toEqual(["pro"]);
    expect(removeCatalog(next, "acme").providers).toEqual({});

    const tmp = makeTempDir();
    dirs.push(tmp);
    const path = join(tmp.path, "models.json");
    writeModelsFile(path, next);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).not.toContain("apiKey");
    expect(readModelsFile(path).providers.acme?.name).toBe("Acme GW");
  });

  it("选择器只认勾过的模型；没加的提供方一律不进", () => {
    const file = upsertCatalog(emptyModelsFile(), "acme", {
      models: [{ id: "a", enabled: true }, { id: "b", enabled: false }, { id: "c" }],
    });
    const shown = visibleModelsOf(
      [
        { provider: "acme", id: "a" },
        { provider: "acme", id: "b" },
        { provider: "acme", id: "c" },
        { provider: "anthropic", id: "claude-fable-5" },
      ],
      file,
    );
    expect(shown.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("backfill 补默认 user-agent；已有的不动；内联 apiKey 不丢", () => {
    const fileA = upsertCatalog(emptyModelsFile(), "a", { name: "A" });
    const file = upsertCatalog(fileA, "b", { name: "B", headers: { "user-agent": "mine" } });
    expect(backfillDefaultHeaders(file)).toBe(true);
    expect(file.providers.a?.headers?.["user-agent"]).toBe("keel-code");
    expect(file.providers.b?.headers?.["user-agent"]).toBe("mine");
    expect(backfillDefaultHeaders(file)).toBe(false);

    const tmp = makeTempDir();
    dirs.push(tmp);
    const path = join(tmp.path, "models.json");
    // pi 兼容：models.json 里可以有内联 apiKey，回填写回不能丢
    writeModelsFile(path, file);
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    raw.providers = {
      ...raw.providers,
      c: { name: "C", apiKey: "inline-key", baseUrl: "https://x", api: "openai-completions" },
    };
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const reloaded = readModelsFile(path);
    expect(reloaded.providers.c?.apiKey).toBe("inline-key");
    expect(backfillDefaultHeaders(reloaded)).toBe(true);
    writeModelsFile(path, reloaded);
    expect(readModelsFile(path).providers.c?.apiKey).toBe("inline-key");
  });
});
