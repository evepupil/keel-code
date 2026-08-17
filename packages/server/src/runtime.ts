/**
 * keel 运行时装配（组合根）：引擎 + 会话中枢 + 名册 / 子 agent + 闭环 / 强制层 + 文档工具。
 * `keel serve`（HTTP + WS）与 `keel run`（无头）共用这一份。
 */
import { createEngine, type Engine, type EngineHost } from "@keel-code/engine";
import { connectMcpServers, loadMcpConfig, type McpManager } from "@keel-code/mcp";
import type { ModelSelector } from "@keel-code/roster";
import { SessionHub } from "./hub.js";
import { type ApprovalServices, setupApprovals } from "./services/approvals.js";
import { setupDocs } from "./services/docs.js";
import { type LoopServices, setupLoop } from "./services/loop.js";
import { type RosterServices, setupRoster } from "./services/roster.js";

export interface KeelRuntimeOptions {
  cwd: string;
  homeDir?: string;
  engine?: Engine;
  /** 多工作区：复用同一个宿主（凭据 / 模型目录 / 设置） */
  host?: EngineHost;
  /** 多工作区：复用同一个能力档选择器（探测缓存） */
  selector?: ModelSelector;
  /** 无头模式：审批全部自动放行 */
  headless?: boolean;
}

export interface KeelRuntime {
  engine: Engine;
  hub: SessionHub;
  roster: RosterServices;
  loop: LoopServices;
  approvals: ApprovalServices;
  mcp: McpManager;
  dispose(): Promise<void>;
}

export async function createKeelRuntime(options: KeelRuntimeOptions): Promise<KeelRuntime> {
  const engine =
    options.engine ??
    (await createEngine({
      cwd: options.cwd,
      ...(options.host ? { host: options.host } : {}),
      ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    }));
  const hub = new SessionHub(engine);
  // 审批先于门禁：先问用户要不要执行，再跑昂贵的项目门禁
  const approvals = setupApprovals(engine, { headless: options.headless ?? false });
  const roster = setupRoster(engine, hub, options.selector);
  const loop = setupLoop(engine, roster);
  const docs = setupDocs(engine, hub);
  // MCP：连接失败不阻塞启动
  const mcp = await connectMcpServers({
    engine,
    config: loadMcpConfig(engine.paths.home, engine.cwd),
  });
  return {
    engine,
    hub,
    roster,
    loop,
    approvals,
    mcp,
    dispose: async () => {
      await mcp.dispose();
      approvals.dispose();
      docs.dispose();
      loop.dispose();
      roster.dispose();
      if (!options.engine) await engine.dispose();
    },
  };
}
