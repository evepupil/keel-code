import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 项目级 keel 配置（`.keel/config.json`）。每条强制可关：逃生舱，且关闭动作在仓库里可见。 */
export interface KeelProjectConfig {
  version: number;
  guards: {
    frontend: boolean;
    lintOnWrite: boolean;
    commitGate: boolean;
    /** 提交前是否跑项目自身门禁（package.json 的 gate / typecheck / lint / test 脚本） */
    projectGate: boolean;
  };
  /** 闭环整体开关（关掉 = 退化成普通编程 agent） */
  loop: boolean;
  acceptance: "immediate" | "milestone" | "final";
}

export const DEFAULT_PROJECT_CONFIG: KeelProjectConfig = {
  version: 1,
  guards: { frontend: true, lintOnWrite: true, commitGate: true, projectGate: true },
  loop: true,
  acceptance: "milestone",
};

export function configPath(cwd: string): string {
  return join(cwd, ".keel", "config.json");
}

/** 读取项目配置，缺失 / 损坏 / 缺字段一律回退默认值（默认全开）。 */
export function readProjectConfig(cwd: string): KeelProjectConfig {
  let raw: Partial<KeelProjectConfig> = {};
  try {
    raw = JSON.parse(readFileSync(configPath(cwd), "utf8")) as Partial<KeelProjectConfig>;
  } catch {
    return { ...DEFAULT_PROJECT_CONFIG, guards: { ...DEFAULT_PROJECT_CONFIG.guards } };
  }
  const guards = { ...DEFAULT_PROJECT_CONFIG.guards, ...(raw.guards ?? {}) };
  return {
    version: raw.version ?? 1,
    guards,
    loop: raw.loop ?? true,
    acceptance: raw.acceptance ?? DEFAULT_PROJECT_CONFIG.acceptance,
  };
}
