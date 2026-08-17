import { HookBus } from "./hooks/bus.js";
import { probeProviders } from "./models/probe.js";
import {
  availableModels,
  createModelRuntime,
  getModel,
  listModels,
  listProviders,
  toModelInfo,
} from "./models/runtime.js";
import { ensureKeelDirs, resolveKeelPaths } from "./paths.js";
import { SessionService } from "./session/manager.js";
import { mergeSettings, readSettings, writeSettings } from "./settings.js";
import type { Engine, EngineOptions } from "./types.js";

/** 创建引擎实例：一个项目目录一个实例。 */
export async function createEngine(options: EngineOptions): Promise<Engine> {
  const paths = resolveKeelPaths(options.cwd, options.homeDir);
  ensureKeelDirs(paths);
  const runtimeOptions =
    options.allowModelNetwork === undefined ? {} : { allowModelNetwork: options.allowModelNetwork };
  const runtime = await createModelRuntime(paths, runtimeOptions);
  const bus = new HookBus();
  const sessions = new SessionService({ cwd: options.cwd, paths, runtime, bus });

  return {
    cwd: options.cwd,
    paths,
    models: {
      providers: () => listProviders(runtime),
      list: (providerId) => listModels(runtime, providerId),
      get: (ref) => {
        const m = getModel(runtime, ref);
        return m ? toModelInfo(m) : undefined;
      },
      available: () => availableModels(runtime),
      setApiKey: (providerId, apiKey) => runtime.setRuntimeApiKey(providerId, apiKey),
      removeApiKey: (providerId) => runtime.removeRuntimeApiKey(providerId),
      probe: (probeOptions) => probeProviders(runtime, probeOptions),
    },
    sessions: {
      create: (o) => sessions.create(o),
      open: (id) => sessions.open(id),
      fork: (sourceId, o) => sessions.fork(sourceId, o),
      list: () => sessions.list(),
      live: (id) => sessions.liveSession(id),
      liveAll: () => sessions.liveAll(),
    },
    hooks: {
      onToolCall: (guard, scope) => bus.onToolCall(guard, scope),
      onToolResult: (hook, scope) => bus.onToolResult(hook, scope),
      onBeforeAgentStart: (hook, scope) => bus.onBeforeAgentStart(hook, scope),
    },
    tools: {
      register: (def, scope) => bus.registerTool(def, scope),
    },
    settings: {
      get: () => readSettings(paths.settingsFile),
      update: (patch) => {
        const next = mergeSettings(readSettings(paths.settingsFile), patch);
        writeSettings(paths.settingsFile, next);
        return next;
      },
    },
    dispose: () => sessions.disposeAll(),
  };
}
