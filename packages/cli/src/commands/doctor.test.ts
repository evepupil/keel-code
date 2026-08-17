import { describe, expect, it } from "vitest";
import { checkNode } from "./doctor.js";

describe("checkNode", () => {
  it("低于 22.19 判失败，高于判通过", () => {
    expect(checkNode("22.14.0").ok).toBe(false);
    expect(checkNode("22.19.0").ok).toBe(true);
    expect(checkNode("24.1.0").ok).toBe(true);
  });
});
