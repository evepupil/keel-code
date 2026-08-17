import type { SessionEntry } from "../../api/types";

export type TaskStatus = "todo" | "doing" | "done";

export interface TaskItem {
  text: string;
  status: TaskStatus;
}

/** 从会话条目里取最新一份任务清单（keel/tasks 整表覆盖，后写覆盖先写）。 */
export function tasksOf(entries: SessionEntry[]): TaskItem[] {
  for (const e of [...entries].reverse()) {
    if (e.customType !== "keel/tasks") continue;
    const raw = e.data as { tasks?: unknown } | null | undefined;
    if (!raw || !Array.isArray(raw.tasks)) return [];
    return raw.tasks.map((t) => {
      const it = t as { text?: unknown; status?: unknown };
      return {
        text: typeof it.text === "string" ? it.text : "",
        status: it.status === "doing" || it.status === "done" ? it.status : "todo",
      };
    });
  }
  return [];
}

/** chip 上的状态摘要：「3 已完成 · 1 进行中」；没有任务返回 null。 */
export function taskSummary(tasks: TaskItem[]): string | null {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "done").length;
  const doing = tasks.filter((t) => t.status === "doing").length;
  if (doing > 0) return `${done} 已完成 · ${doing} 进行中`;
  return tasks.every((t) => t.status === "done")
    ? `${done} 已完成`
    : `${done} 已完成 · ${tasks.length - done} 待办`;
}
