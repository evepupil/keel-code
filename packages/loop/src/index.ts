/**
 * @keel-code/loop
 *
 * 闭环编排器：keel_batch_report 绑定入口 → 独立 reviewer → 分类路由 → 修复循环 → review-pass → 待决策 → 验收简述。
 */
export const PACKAGE_NAME = "@keel-code/loop" as const;
export { acceptanceBrief } from "./acceptance/brief.js";
export {
  extractCommand,
  GIT_COMMIT_RE,
  isGitCommit,
  SHELL_TOOL_RE,
} from "./credit/commit-detect.js";
export {
  type ReviewPass,
  type ReviewState,
  readReviewState,
  reviewStatePath,
  writeReviewState,
} from "./credit/state.js";
export { isGitRepo, treeHash } from "./credit/tree-hash.js";
export {
  appendDecisions,
  countPendingDecisions,
  DECISIONS_REL,
  decisionsPath,
  listPendingDecisions,
  type PendingDecision,
  resolveDecision,
} from "./decisions/file.js";
export {
  type LoopDeps,
  REVIEW_ENTRY,
  type ReviewEntryData,
  registerBatchReportTool,
} from "./report/orchestrator.js";
export { pickReviewerModel } from "./reviewer/model.js";
export { REVIEW_SCHEMA, type ReviewerPromptInput, reviewerPrompt } from "./reviewer/prompt.js";
export {
  classify,
  type Finding,
  type FindingCategory,
  formatFindings,
  isNoopFinding,
  type ReviewVerdict,
  type RouteAction,
  type RouteResult,
} from "./route/classify.js";
