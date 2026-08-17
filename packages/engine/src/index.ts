/**
 * @keel-code/engine
 *
 * keel 的发动机封装层：会话、消息、事件流、工具、钩子、模型与凭据、端点探测。
 * 上层只依赖这里导出的接口与类型，不直接接触 pi。
 */

export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export { createEngine, createEngineHost } from "./engine.js";
export { scopeMatches } from "./hooks/bus.js";
export { buildModelsRequest, parseModelIds } from "./models/probe.js";
export {
  importPiCredentials,
  projectDirName,
  resolveHomePaths,
  resolveKeelPaths,
} from "./paths.js";
export { convertMessage, convertMessages, convertUsage } from "./session/convert.js";
export { KEEL_META_ENTRY, KEEL_SYSTEM_PROMPT_ENTRY } from "./session/index-store.js";
export { sumUsage } from "./session/session.js";
export type * from "./types.js";
