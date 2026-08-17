/**
 * 装配名册 / 对话工具 / 子 agent：SessionHub 充当 ConversationGateway。
 */
import type { Engine } from "@keel-code/engine";
import {
  type ConversationGateway,
  RosterStore,
  registerRosterTools,
  SubagentRunner,
} from "@keel-code/roster";
import type { SessionHub } from "../hub.js";

export interface RosterServices {
  store: RosterStore;
  runner: SubagentRunner;
  gateway: ConversationGateway;
  dispose(): void;
}

export function setupRoster(engine: Engine, hub: SessionHub): RosterServices {
  const gateway: ConversationGateway = {
    list: () => hub.list(),
    get: (id) => hub.get(id),
    create: (input) => hub.create(input),
    liveState: (id) => hub.liveState(id),
  };
  const options = {
    getModelLocks: () => engine.settings.get().modelLocks ?? {},
    get cacheTtlMs() {
      return engine.settings.get().cacheTtlMs ?? {};
    },
  };
  const store = new RosterStore({ cwd: engine.cwd, gateway, options });
  const runner = new SubagentRunner({ engine, gateway });
  const off = registerRosterTools({ engine, gateway, store, runner, options });
  return { store, runner, gateway, dispose: off };
}
