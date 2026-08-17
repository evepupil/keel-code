/**
 * vitest 全局 setup：剥掉宿主环境的模型 provider 变量。
 * 实现与引擎启动时同一份，避免从 Claude Code 会话跑测试时被代理带偏。
 */
import { scrubInheritedProviderEnv } from "../packages/engine/src/models/env.js";

scrubInheritedProviderEnv();
