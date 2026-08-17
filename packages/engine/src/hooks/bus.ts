import type {
  BeforeAgentStartHook,
  BeforeAgentStartInput,
  BeforeAgentStartResult,
  HookScope,
  KeelToolDefinition,
  SessionMeta,
  ToolCallGuard,
  ToolCallGuardInput,
  ToolCallGuardResult,
  ToolResultHook,
  ToolResultHookInput,
  Unsubscribe,
} from "../types.js";

interface Scoped<T> {
  value: T;
  scope: HookScope | undefined;
}

export function scopeMatches(scope: HookScope | undefined, meta: SessionMeta): boolean {
  if (!scope) return true;
  if (scope.kinds && !scope.kinds.includes(meta.kind)) return false;
  if (scope.match && !scope.match(meta)) return false;
  return true;
}

/**
 * 钩子总线：进程级注册，按会话作用域生效。
 * tool_call 守卫是单调的：任一守卫拒绝即拒绝，后续守卫不再执行（无法翻转）。
 */
export class HookBus {
  private readonly toolCallGuards: Scoped<ToolCallGuard>[] = [];
  private readonly toolResultHooks: Scoped<ToolResultHook>[] = [];
  private readonly beforeAgentStartHooks: Scoped<BeforeAgentStartHook>[] = [];
  private readonly toolDefs: Scoped<KeelToolDefinition>[] = [];

  onToolCall(guard: ToolCallGuard, scope?: HookScope): Unsubscribe {
    return push(this.toolCallGuards, { value: guard, scope });
  }

  onToolResult(hook: ToolResultHook, scope?: HookScope): Unsubscribe {
    return push(this.toolResultHooks, { value: hook, scope });
  }

  onBeforeAgentStart(hook: BeforeAgentStartHook, scope?: HookScope): Unsubscribe {
    return push(this.beforeAgentStartHooks, { value: hook, scope });
  }

  /**
   * 注册工具。同名工具允许并存，前提是双方都带作用域（例如按运行 id 区分的一次性工具）；
   * 无作用域的全局工具不允许重名。某条会话可见多个同名工具时取先注册的。
   */
  registerTool(def: KeelToolDefinition, scope?: HookScope): Unsubscribe {
    const clash = this.toolDefs.find((t) => t.value.name === def.name && (!t.scope || !scope));
    if (clash) throw new Error(`工具名重复注册：${def.name}`);
    return push(this.toolDefs, { value: def, scope });
  }

  toolsFor(meta: SessionMeta): KeelToolDefinition[] {
    const seen = new Set<string>();
    const out: KeelToolDefinition[] = [];
    for (const t of this.toolDefs) {
      if (!scopeMatches(t.scope, meta) || seen.has(t.value.name)) continue;
      seen.add(t.value.name);
      out.push(t.value);
    }
    return out;
  }

  async runToolCall(input: ToolCallGuardInput): Promise<ToolCallGuardResult> {
    for (const g of this.toolCallGuards) {
      if (!scopeMatches(g.scope, input.meta)) continue;
      const r = await g.value(input);
      if (r?.block) return { block: true, reason: r.reason ?? "被 keel 强制层拦截" };
    }
    return {};
  }

  async runToolResult(input: ToolResultHookInput): Promise<void> {
    for (const h of this.toolResultHooks) {
      if (!scopeMatches(h.scope, input.meta)) continue;
      await h.value(input);
    }
  }

  async runBeforeAgentStart(input: BeforeAgentStartInput): Promise<BeforeAgentStartResult> {
    let systemPrompt: string | undefined;
    for (const h of this.beforeAgentStartHooks) {
      if (!scopeMatches(h.scope, input.meta)) continue;
      const r = await h.value({ ...input, systemPrompt: systemPrompt ?? input.systemPrompt });
      if (r?.systemPrompt !== undefined) systemPrompt = r.systemPrompt;
    }
    return systemPrompt === undefined ? {} : { systemPrompt };
  }
}

function push<T>(list: Scoped<T>[], item: Scoped<T>): Unsubscribe {
  list.push(item);
  return () => {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  };
}
