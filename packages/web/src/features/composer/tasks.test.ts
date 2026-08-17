import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../../api/types";
import { taskSummary, tasksOf } from "./tasks";

const entry = (data: unknown): SessionEntry => ({
  id: `e${Math.random()}`,
  customType: "keel/tasks",
  data,
  timestamp: 1,
});

describe("tasksOf", () => {
  it("取最新一份，坏数据兜底", () => {
    const entries = [
      entry({ tasks: [{ text: "旧", status: "done" }] }),
      entry({
        tasks: [
          { text: "梳理", status: "done" },
          { text: "实现", status: "doing" },
          { text: "补测试", status: "todo" },
          { text: "坏数据" },
        ],
      }),
    ];
    expect(tasksOf(entries)).toEqual([
      { text: "梳理", status: "done" },
      { text: "实现", status: "doing" },
      { text: "补测试", status: "todo" },
      { text: "坏数据", status: "todo" },
    ]);
    expect(tasksOf([])).toEqual([]);
    expect(tasksOf([entry({ tasks: "不是数组" })])).toEqual([]);
  });
});

describe("taskSummary", () => {
  it("按状态给摘要", () => {
    expect(taskSummary([])).toBeNull();
    expect(
      taskSummary([
        { text: "a", status: "done" },
        { text: "b", status: "doing" },
        { text: "c", status: "todo" },
      ]),
    ).toBe("1 已完成 · 1 进行中");
    expect(
      taskSummary([
        { text: "a", status: "done" },
        { text: "b", status: "todo" },
      ]),
    ).toBe("1 已完成 · 1 待办");
    expect(taskSummary([{ text: "a", status: "done" }])).toBe("1 已完成");
  });
});
