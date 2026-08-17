import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("testkit 骨架", () => {
  it("导出包名", () => {
    expect(PACKAGE_NAME).toBe("@keel-code/testkit");
  });
});
