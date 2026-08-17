import { describe, expect, it } from "vitest";
import { newInputHistory, pushHistory, stepHistory } from "./input-history.js";

describe("pushHistory", () => {
  it("追加并去重连续重复", () => {
    let h = newInputHistory();
    h = pushHistory(h, "a");
    h = pushHistory(h, "b");
    h = pushHistory(h, "b");
    expect(h.items).toEqual(["a", "b"]);
  });

  it("浏览中发送后退出浏览态", () => {
    let h = pushHistory(newInputHistory(), "x");
    h = { ...h, index: 0, draft: "y" };
    h = pushHistory(h, "z");
    expect(h.index).toBe(-1);
    expect(h.draft).toBe("");
  });
});

describe("stepHistory", () => {
  const base = pushHistory(pushHistory(newInputHistory(), "first"), "second");

  it("空输入按上：进到最后一条；再按上往前", () => {
    const up1 = stepHistory(base, "ArrowUp", "");
    expect(up1?.text).toBe("second");
    const up2 = stepHistory(up1!.history, "ArrowUp", up1!.text);
    expect(up2?.text).toBe("first");
    // 顶了再按：停在最旧
    const up3 = stepHistory(up2!.history, "ArrowUp", up2!.text);
    expect(up3?.text).toBe("first");
  });

  it("有内容且没在浏览：上键不接管", () => {
    expect(stepHistory(base, "ArrowUp", "正在打字")).toBeNull();
  });

  it("浏览态按上时草稿保住，下键退到底恢复草稿", () => {
    const up = stepHistory(base, "ArrowUp", "");
    const down1 = stepHistory(up!.history, "ArrowDown", up!.text);
    expect(down1?.text).toBe("");
    expect(down1?.history.index).toBe(-1);
  });

  it("没在浏览按下键：不接管", () => {
    expect(stepHistory(base, "ArrowDown", "x")).toBeNull();
  });
});
