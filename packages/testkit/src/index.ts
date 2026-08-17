/**
 * @keel-code/testkit
 *
 * Mock OpenAI 兼容服务、临时项目 / 用户目录夹具。让整套系统不依赖真模型也能回归。
 */
export const PACKAGE_NAME = "@keel-code/testkit" as const;
export {
  type MockProviderSpec,
  makeTempDir,
  makeTempKeelHome,
  makeTempProject,
  type TempDir,
  type TempProjectOptions,
} from "./fixtures.js";
export {
  type MockOpenAIServer,
  type MockOpenAIServerOptions,
  type RecordedRequest,
  type ScriptedToolCall,
  type ScriptedTurn,
  startMockOpenAIServer,
} from "./mock-openai-server.js";
