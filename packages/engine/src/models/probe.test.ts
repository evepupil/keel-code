import { describe, expect, it } from "vitest";
import { buildModelsRequest, isAuthFailureStatus, parseModelIds } from "./probe.js";

describe("buildModelsRequest", () => {
  it("anthropic：/v1/models + x-api-key", () => {
    const r = buildModelsRequest("anthropic-messages", "https://api.anthropic.com", "k");
    expect(r?.url).toBe("https://api.anthropic.com/v1/models");
    expect(r?.headers["x-api-key"]).toBe("k");
    expect(r?.headers["anthropic-version"]).toBeDefined();
  });
  it("anthropic：baseUrl 已带 /v1 不重复", () => {
    const r = buildModelsRequest("anthropic-messages", "https://proxy/v1/", "k");
    expect(r?.url).toBe("https://proxy/v1/models");
  });
  it("openai 系：/models + Bearer", () => {
    const r = buildModelsRequest("openai-completions", "https://api.deepseek.com", "k");
    expect(r?.url).toBe("https://api.deepseek.com/models");
    expect(r?.headers.authorization).toBe("Bearer k");
    expect(buildModelsRequest("openai-responses", "https://api.openai.com/v1", "k")?.url).toBe(
      "https://api.openai.com/v1/models",
    );
  });
  it("未知 api 返回 undefined", () => {
    expect(buildModelsRequest("bedrock-converse-stream", "https://x", "k")).toBeUndefined();
  });
});

describe("parseModelIds", () => {
  it("解析 OpenAI / Anthropic 风格与裸数组", () => {
    expect([...parseModelIds({ data: [{ id: "a" }, { id: "b" }] })]).toEqual(["a", "b"]);
    expect([...parseModelIds([{ id: "c" }])]).toEqual(["c"]);
    expect([...parseModelIds({ nope: 1 })]).toEqual([]);
    expect([...parseModelIds(null)]).toEqual([]);
  });
});

describe("isAuthFailureStatus", () => {
  it("401/403 算认证失败，其余不算", () => {
    expect(isAuthFailureStatus(401)).toBe(true);
    expect(isAuthFailureStatus(403)).toBe(true);
    expect(isAuthFailureStatus(404)).toBe(false);
    expect(isAuthFailureStatus(500)).toBe(false);
    expect(isAuthFailureStatus(200)).toBe(false);
  });
});
