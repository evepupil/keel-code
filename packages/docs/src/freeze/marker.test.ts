import { describe, expect, it } from "vitest";
import { applyFreeze, readFreeze } from "./marker.js";

describe("冻结标记", () => {
  it("插到一级标题后，幂等替换，可读回", () => {
    const doc = "# 登录\n\n- **模块定位**：x\n";
    const once = applyFreeze(doc, {
      commit: "abc1234",
      at: "2026-08-17T04:00:00.000Z",
      note: "按批注修订",
    });
    expect(once.split("\n")[2]).toBe(
      "> 设计已确认 · 冻结版本 abc1234 · 2026-08-17 04:00 · 按批注修订",
    );
    const twice = applyFreeze(once, { commit: "def5678", at: "2026-08-18T04:00:00.000Z" });
    expect(twice.match(/设计已确认/g)?.length).toBe(1);
    expect(readFreeze(twice)).toEqual({ commit: "def5678", at: "2026-08-18 04:00" });
  });
  it("没有标题放文首", () => {
    expect(
      applyFreeze("正文", { commit: "a", at: "2026-08-17T00:00:00.000Z" }).startsWith(
        "> 设计已确认",
      ),
    ).toBe(true);
  });
});
