/**
 * @keel-code/guards
 *
 * 强制层：guard-frontend、commit-gate（review credit + 项目门禁）、lint-on-write。判定是纯函数，挂载只做适配。
 */
export const PACKAGE_NAME = "@keel-code/guards" as const;
export {
  type CreditJudgeInput,
  extractCommand,
  GIT_COMMIT_RE,
  isGitCommit,
  judgeReviewCredit,
  type ProjectGateResult,
  runProjectGate,
} from "./commit/gate.js";
export {
  configPath,
  DEFAULT_PROJECT_CONFIG,
  type KeelProjectConfig,
  readProjectConfig,
} from "./config/keel-config.js";
export {
  collectPaths,
  DESIGN_SYSTEM_MARKERS,
  type FrontendGuardInput,
  hasDesignSystem,
  isBusinessPagePath,
  judgeFrontendWrite,
  WRITE_TOOL_RE,
} from "./frontend/guard.js";
export { detectFormatter, type Formatter, formatFile, isFormattable } from "./lint/on-write.js";
export { type RegisterGuardsDeps, registerGuards } from "./register.js";
