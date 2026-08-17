import { BASE_SECTIONS, type PromptSection } from "./base/sections.js";
import { MAIN_SCHEDULER_SECTION } from "./main/scheduler.js";

export type ConversationKind = "main" | "conversation" | "subagent";

export interface AssembleOptions {
  kind: ConversationKind;
  /** 创建时注入的职责段（一段话） */
  role?: string;
  /** 名册导航摘要（主对话用），已渲染好的文本 */
  rosterDigest?: string;
  /** 当前项目的额外约束（如已冻结的设计文档路径、逃生舱开关状态） */
  constraints?: string[];
  /** 子 agent 的任务描述（kind = subagent 时使用） */
  task?: string;
}

function renderSection(s: PromptSection): string {
  return `## ${s.title}\n\n${s.body.trim()}`;
}

/**
 * 组装系统提示：base（全员共享）+ 主对话调度段（仅 main）+ 职责段 + 名册导航 + 约束。
 * 子 agent 只带精简 base（工作流与硬规则）+ 任务。
 */
export function assembleSystemPrompt(options: AssembleOptions): string {
  const parts: string[] = ["# keel-code 方法论"];
  const sections =
    options.kind === "subagent"
      ? BASE_SECTIONS.filter((s) => ["what", "rules", "frontend", "review"].includes(s.id))
      : BASE_SECTIONS;
  parts.push(...sections.map(renderSection));

  if (options.kind === "main") {
    parts.push(renderSection(MAIN_SCHEDULER_SECTION));
  }
  if (options.role) {
    parts.push(`## 职责\n\n${options.role.trim()}`);
  }
  if (options.kind === "subagent" && options.task) {
    parts.push(`## 任务\n\n${options.task.trim()}`);
  }
  if (options.rosterDigest) {
    parts.push(`## 名册（导航用，不是事实）\n\n${options.rosterDigest.trim()}`);
  }
  if (options.constraints && options.constraints.length > 0) {
    parts.push(`## 当前约束\n\n${options.constraints.map((c) => `- ${c}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

export type { PromptSection };
export { BASE_SECTIONS, MAIN_SCHEDULER_SECTION };
