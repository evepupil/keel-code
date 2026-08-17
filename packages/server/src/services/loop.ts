/**
 * 装配闭环编排器与强制层：keel_batch_report 工具、guard-frontend / commit-gate / lint-on-write 钩子。
 * review 状态文件放在 keel 用户目录的项目会话目录下。
 */
import type { Engine } from "@keel-code/engine";
import { readProjectConfig, registerGuards } from "@keel-code/guards";
import { registerBatchReportTool, registerDocPruneJob, reviewStatePath } from "@keel-code/loop";
import type { RosterServices } from "./roster.js";

export interface LoopServices {
  reviewStateFile: string;
  dispose(): void;
}

export function setupLoop(engine: Engine, roster: RosterServices): LoopServices {
  const reviewStateFile = reviewStatePath(engine.paths.projectSessionsDir);
  const offLoop = registerBatchReportTool({
    engine,
    gateway: roster.gateway,
    runner: roster.runner,
    selector: roster.selector,
    reviewStateFile,
    options: {
      getModelLocks: () => engine.settings.get().modelLocks ?? {},
      enabled: () => readProjectConfig(engine.cwd).loop,
    },
  });
  const offGuards = registerGuards({ engine, reviewStateFile });
  const offPrune = registerDocPruneJob({
    engine,
    gateway: roster.gateway,
    runner: roster.runner,
    enabled: () => readProjectConfig(engine.cwd).docPrune,
  });
  return {
    reviewStateFile,
    dispose: () => {
      offPrune();
      offLoop();
      offGuards();
    },
  };
}
