import { describe, expect, it } from "vitest";
import { validateSteps } from "./run.js";

describe("validateSteps", () => {
  it("空 / 重复 id / 未知依赖 / 成环 都报错", () => {
    expect(validateSteps([])).toMatch(/不能为空/);
    expect(
      validateSteps([
        { id: "a", task: "x" },
        { id: "a", task: "y" },
      ]),
    ).toMatch(/重复/);
    expect(validateSteps([{ id: "a", task: "x", dependsOn: ["b"] }])).toMatch(/不存在/);
    expect(
      validateSteps([
        { id: "a", task: "x", dependsOn: ["b"] },
        { id: "b", task: "y", dependsOn: ["a"] },
      ]),
    ).toMatch(/成环/);
    expect(
      validateSteps([
        { id: "a", task: "x" },
        { id: "b", task: "y", dependsOn: ["a"] },
      ]),
    ).toBeUndefined();
  });
});
