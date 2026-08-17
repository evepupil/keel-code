import type { Engine, KeelSettings, ModelInfo, ProviderProbe } from "@keel-code/engine";
import { describe, expect, it } from "vitest";
import { kindTier, ModelSelector, renderTierDigest } from "./select.js";

const model = (provider: string, id: string, input = 1): ModelInfo => ({
  provider,
  id,
  name: id,
  api: "openai-completions",
  baseUrl: "http://x",
  reasoning: false,
  input: ["text"],
  cost: { input, output: input * 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
});

/** 假引擎：只实现选择器用到的三样——available / probe / settings */
function fakeEngine(models: ModelInfo[], settings: KeelSettings, unreachable: string[] = []) {
  const probes: string[] = [];
  const engine = {
    models: {
      available: async () => models,
      probe: async (o: { providers?: string[] }): Promise<ProviderProbe[]> => {
        probes.push(...(o.providers ?? []));
        return (o.providers ?? []).map((p) => ({
          provider: p,
          name: p,
          configured: true,
          reachable: !unreachable.includes(p),
          models: [],
          ...(unreachable.includes(p) ? { error: "timeout" } : { latencyMs: 10 }),
        }));
      },
    },
    settings: { get: () => settings, update: () => settings },
  } as unknown as Engine;
  return { engine, probes };
}

describe("ModelSelector", () => {
  const A = model("a", "a-big", 5);
  const B = model("b", "b-mid", 1);
  const C = model("c", "c-small", 0.1);

  it("按档落实，首选优先，缺省 standard", async () => {
    const { engine } = fakeEngine([A, B, C], {
      modelTiers: { "a/a-big": "flagship", "c/c-small": "light" },
      preferred: { standard: "b/b-mid" },
    });
    const sel = new ModelSelector(engine);
    expect((await sel.resolve({ tier: "flagship" }))?.model.id).toBe("a-big");
    expect((await sel.resolve({ tier: "standard" }))?.model.id).toBe("b-mid");
    expect((await sel.resolve({ tier: "light" }))?.model.id).toBe("c-small");
  });

  it("缺档回退并说明；停用的不选；不可达的 provider 跳过", async () => {
    const { engine, probes } = fakeEngine(
      [A, B, C],
      { modelTiers: { "a/a-big": "flagship" }, modelDisabled: ["b/b-mid"] },
      ["a"],
    );
    const sel = new ModelSelector(engine);
    // 旗舰只有 a（不可达）→ 回退标准：b 停用 → c（standard 缺省）
    const r = await sel.resolve({ tier: "flagship" });
    expect(r?.model.id).toBe("c-small");
    expect(r?.resolvedTier).toBe("standard");
    expect(r?.note).toContain("回退");
    // 探测有缓存：再解析不重复探测同一 provider
    const n = probes.length;
    await sel.resolve({ tier: "flagship" });
    expect(probes.length).toBe(n);
  });

  it("避开实现者：同档有别的就换，只剩它就用它", async () => {
    const { engine } = fakeEngine([A, B], {
      modelTiers: { "a/a-big": "flagship", "b/b-mid": "flagship" },
    });
    const sel = new ModelSelector(engine);
    expect(
      (await sel.resolve({ tier: "flagship", avoid: { provider: "a", id: "a-big" } }))?.model.id,
    ).toBe("b-mid");
    const only = new ModelSelector(
      fakeEngine([A], { modelTiers: { "a/a-big": "flagship" } }).engine,
    );
    const r = await only.resolve({ tier: "flagship", avoid: { provider: "a", id: "a-big" } });
    expect(r?.model.id).toBe("a-big");
    expect(r?.note).toContain("未能避开");
  });

  it("全部不可用返回 undefined；overview 与摘要", async () => {
    const { engine } = fakeEngine([A], {}, ["a"]);
    const sel = new ModelSelector(engine);
    expect(await sel.resolve({ tier: "standard" })).toBeUndefined();
    const views = await sel.overview();
    expect(views.map((v) => v.label)).toEqual(["轻量", "标准", "旗舰"]);
    const digest = renderTierDigest(views, {});
    expect(digest).toContain("无可用模型");
    expect(kindTier({}, "reviewer")).toBe("flagship");
    expect(kindTier({ kindTiers: { reviewer: "standard" } }, "reviewer")).toBe("standard");
  });
});
