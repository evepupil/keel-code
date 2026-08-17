/**
 * @keel-code/server
 *
 * 本地服务：HTTP + WebSocket API（项目 / 对话 / 事件 / provider / 设置）。只监听回环地址。
 */
export const PACKAGE_NAME = "@keel-code/server" as const;
export { buildApp } from "./app.js";
export { type CreateConversationInput, type HubEvent, SessionHub } from "./hub.js";
export { type RunningServer, type StartServerOptions, startServer } from "./serve.js";
