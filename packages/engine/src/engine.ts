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
import {
  ensureHomeDirs,
  ensureKeelDirs,
  importPiCredentials,
  resolveHomePaths,
  resolveKeelPaths,
} from "./paths.js";
import { SessionService } from "./session/manager.js";
import { mergeSettings, readSettings, writeSettings } from "./settings.js";
import type { Engine, EngineHost, EngineHostOptions, EngineOptions } from "./types.js";

/** 创建用户级宿主：凭据 / 模型目录 / 设置一份，多个项目引擎共享。 */
export async function createEngineHost(options: EngineHostOptions = {}): Promise<EngineHost> {
  const home = resolveHomePaths(options.homeDir);
  ensureHomeDirs(home);
  // 只在默认用户目录（~/.keel）首次启动时从 pi 导入凭据；测试 / 演示用的临时目录不导，避免误用真 key
  if (!options.homeDir && !process.env.KEEL_HOME) importPiCredentials(home);
  const runtimeOptions =
    options.allowModelNetwork === undefined ? {} : { allowModelNetwork: options.allowModelNetwork };
  const runtime = await createModelRuntime(home, runtimeOptions);
  const models: Engine["models"] = {
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
  };
  const settings: Engine["settings"] = {
    get: () => readSettings(home.settingsFile),
    update: (patch) => {
      const next = mergeSettings(readSettings(home.settingsFile), patch);
      writeSettings(home.settingsFile, next);
      return next;
    },
  };
  const engines = new Set<Engine>();
  const host: EngineHost = {
    home: home.home,
    models,
    settings,
    createEngine: async ({ cwd }) => {
      const paths = resolveKeelPaths(cwd, home.home);
      ensureKeelDirs(paths);
      const bus = new HookBus();
      const sessions = new SessionService({ cwd, paths, runtime, bus });
      const engine: Engine = {
        cwd,
        paths,
        models,
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
        settings,
        dispose: async () => {
          engines.delete(engine);
          await sessions.disposeAll();
        },
      };
      engines.add(engine);
      return engine;
    },
    dispose: async () => {
      for (const e of [...engines]) await e.dispose();
    },
  };
  return host;
}

/** 创建引擎实例：一个项目目录一个实例（没给 host 就自建一个私有宿主，随引擎一起释放）。 */
export async function createEngine(options: EngineOptions): Promise<Engine> {
  if (options.host) return options.host.createEngine({ cwd: options.cwd });
  const host = await createEngineHost({
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    ...(options.allowModelNetwork === undefined
      ? {}
      : { allowModelNetwork: options.allowModelNetwork }),
  });
  const engine = await host.createEngine({ cwd: options.cwd });
  return {
    ...engine,
    dispose: async () => {
      await engine.dispose();
      await host.dispose();
    },
  };
}
