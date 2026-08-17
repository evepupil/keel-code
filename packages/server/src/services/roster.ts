/**
 * 装配名册 / 对话工具 / 子 agent：SessionHub 充当 ConversationGateway。
 */
import type { Engine } from "@keel-code/engine";
import {
  type ConversationGateway,
  kindTier,
  ModelSelector,
  RosterStore,
  registerRosterTools,
  SubagentRunner,
} from "@keel-code/roster";
import type { SessionHub } from "../hub.js";

export interface RosterServices {
  store: RosterStore;
  runner: SubagentRunner;
  gateway: ConversationGateway;
  selector: ModelSelector;
  dispose(): void;
}

export function setupRoster(
  engine: Engine,
  hub: SessionHub,
  sharedSelector?: ModelSelector,
): RosterServices {
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
  const selector = sharedSelector ?? new ModelSelector(engine);
  const runner = new SubagentRunner({ engine, gateway, selector });
  const off = registerRosterTools({ engine, gateway, store, runner, selector, options });
  // 主对话 / 普通对话没指定模型时按类别默认档落实（可达优先）
  hub.setModelResolver(async (kind, tier) => {
    const r = await selector.resolve({ tier: tier ?? kindTier(engine.settings.get(), kind) });
    return r ? { provider: r.model.provider, id: r.model.id } : undefined;
  });
  return { store, runner, gateway, selector, dispose: off };
}
