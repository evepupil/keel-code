import { describe, expect, it } from "vitest";
import { scrubInheritedProviderEnv } from "./env.js";

describe("scrubInheritedProviderEnv", () => {
  it("剥掉 ANTHROPIC_ / OPENAI_ 等，留下无关变量", () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
      ANTHROPIC_AUTH_TOKEN: "x",
      OPENAI_API_KEY: "sk",
      PATH: "/usr/bin",
      KEEL_HOME: "C:\\\\keel",
    };
    expect(scrubInheritedProviderEnv(env).sort()).toEqual([
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "OPENAI_API_KEY",
    ]);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.KEEL_HOME).toBe("C:\\\\keel");
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });
});
