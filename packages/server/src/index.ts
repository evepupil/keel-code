/**
 * @keel-code/server
 *
 * 本地服务：HTTP + WebSocket API（项目 / 对话 / 事件 / provider / 设置）。只监听回环地址。
 */
export const PACKAGE_NAME = "@keel-code/server" as const;
export { buildApp, buildWorkspaceApp } from "./app.js";
export { type CreateConversationInput, type HubEvent, SessionHub } from "./hub.js";
export { createKeelRuntime, type KeelRuntime, type KeelRuntimeOptions } from "./runtime.js";
export { type RunningServer, type StartServerOptions, startServer } from "./serve.js";
export {
  type ApprovalDecision,
  type ApprovalRequest,
  type ApprovalServices,
  isSafeCommand,
  needsApproval,
} from "./services/approvals.js";
export {
  WorkspaceManager,
  type WorkspaceManagerOptions,
  type WorkspaceView,
} from "./workspaces/manager.js";
export { type PickResult, pickFolder } from "./workspaces/pick-folder.js";
export {
  isProjectDir,
  type WorkspaceRecord,
  WorkspaceRegistry,
  workspaceIdOf,
} from "./workspaces/registry.js";
export {
  clearWebState,
  isProcessAlive,
  pingWeb,
  readWebState,
  type WebState,
  webStateFile,
  webUrl,
  writeWebState,
} from "./workspaces/web-state.js";
