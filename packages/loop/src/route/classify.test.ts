import { describe, expect, it } from "vitest";
import { classify, isNoopFinding } from "./classify.js";

const det = (issue: string, suggestion = "改掉") => ({
  issue,
  category: "deterministic" as const,
  suggestion,
});
const dec = (issue: string) => ({ issue, category: "decision" as const });

describe("classify", () => {
  it("pass 且无问题 → pass", () => {
    expect(classify({ verdict: "pass", findings: [] }, 1, 3).action).toBe("pass");
  });
  it("只有 noop finding 也算 pass（不卡死闭环）", () => {
    const r = classify({ verdict: "pass", findings: [det("样式ok", "无需修改")] }, 1, 3);
    expect(r.action).toBe("pass");
    expect(r.notes).toHaveLength(1);
  });
  it("有确定性问题 → fix；到上限 → escalate", () => {
    expect(classify({ verdict: "fail", findings: [det("空指针")] }, 1, 3).action).toBe("fix");
    expect(classify({ verdict: "fail", findings: [det("空指针")] }, 3, 3).action).toBe("escalate");
  });
  it("只有待决策 → suspend；混合 → fix 并携带待决策", () => {
    expect(classify({ verdict: "fail", findings: [dec("要不要支持匿名")] }, 1, 3).action).toBe(
      "suspend",
    );
    const r = classify({ verdict: "fail", findings: [dec("取舍"), det("类型错")] }, 1, 3);
    expect(r.action).toBe("fix");
    expect(r.decisions).toHaveLength(1);
    expect(r.deterministic).toHaveLength(1);
  });
  it("isNoopFinding 只认确定性 + 无需动作措辞", () => {
    expect(isNoopFinding(det("x", "确认无误"))).toBe(true);
    expect(isNoopFinding(det("x", "改成 token"))).toBe(false);
    expect(isNoopFinding({ issue: "x", category: "decision", suggestion: "无需修改" })).toBe(false);
  });
});
