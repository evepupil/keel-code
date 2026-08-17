import { describe, expect, it } from "vitest";
import { parseRoadmap } from "./parse.js";

const MD = `# X Roadmap

## 目标

做一个 Y。

## 里程碑

| 里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准 |
|---|---|---|---|---|---|
| [M0](#m0) | 初始化 | 已完成 | 无 | [引擎](模块设计/引擎.md) · [CLI](模块设计/CLI.md) | 门禁全绿 |
| [M1](#m1) | 引擎 | 进行中 | M0 | 待建 | 跑通 |
`;

describe("parseRoadmap", () => {
  it("解析标题、目标与里程碑表", () => {
    const r = parseRoadmap(MD);
    expect(r.title).toBe("X Roadmap");
    expect(r.goal).toBe("做一个 Y。");
    expect(r.milestones).toHaveLength(2);
    expect(r.milestones[0]).toMatchObject({
      id: "M0",
      status: "已完成",
      deps: "无",
      exit: "门禁全绿",
    });
    expect(r.milestones[0]?.docs).toEqual([
      { text: "引擎", href: "模块设计/引擎.md" },
      { text: "CLI", href: "模块设计/CLI.md" },
    ]);
    expect(r.milestones[1]?.docs).toEqual([]);
  });
  it("没有表格返回空", () => {
    expect(parseRoadmap("# nothing").milestones).toEqual([]);
  });
});
