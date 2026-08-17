/**
 * @keel-code/roster
 *
 * 对话 / 子 agent / 名册：主对话工具（探测 → 选模型 → 创建 / 发消息 / 交接 / 归档）、
 * 子 agent 运行器（clean / fork）、名册记录 + 新鲜度 + `.keel/agents/` 投影。
 */
export const PACKAGE_NAME = "@keel-code/roster" as const;
export { applyLock, type ModelTier, renderProbeDigest, tierOf } from "./models/tiers.js";
export { renderRosterDigest } from "./registry/digest.js";
export { computeFreshness, formatIdle } from "./registry/freshness.js";
export { codeHash, currentCommit } from "./registry/git.js";
export { renderRosterMarkdown, writeProjection } from "./registry/projection.js";
export {
  mergeRecord,
  ROSTER_EXTRA_KEY,
  recordOf,
  rosterFileName,
  withRecord,
} from "./registry/record.js";
export { RosterStore, type RosterStoreDeps } from "./registry/store.js";
export {
  AGENT_RUN_PARAMS,
  type RunSubagentInput,
  type RunSubagentResult,
  SubagentRunner,
  type SubagentRunnerDeps,
} from "./subagents/run.js";
export { type RegisterRosterToolsDeps, registerRosterTools } from "./tools/register.js";
export type * from "./types.js";
