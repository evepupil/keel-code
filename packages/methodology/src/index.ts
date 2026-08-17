/**
 * @keel-code/methodology
 *
 * 提示词层本体：base 方法论（全员共享）、主对话调度段、组装函数。
 * 规则的「为什么」在这里；「绕不过去」交给 @keel-code/guards。
 */
export const PACKAGE_NAME = "@keel-code/methodology" as const;
export {
  type AssembleOptions,
  assembleSystemPrompt,
  BASE_SECTIONS,
  type ConversationKind,
  MAIN_SCHEDULER_SECTION,
  type PromptSection,
} from "./assemble.js";
