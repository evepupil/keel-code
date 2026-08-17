/**
 * 工作区管理器：一个工作区 = 一个 KeelRuntime，按需懒启动，长时间没人用自动释放。
 * 所有工作区共享同一个 EngineHost（凭据 / 模型目录 / 设置）与同一个 ModelSelector（探测缓存）。
 */
import type { EngineHost } from "@keel-code/engine";
import type { ModelSelector } from "@keel-code/roster";
import { createKeelRuntime, type KeelRuntime } from "../runtime.js";
import { isProjectDir, type WorkspaceRecord, type WorkspaceRegistry } from "./registry.js";

export interface WorkspaceManagerOptions {
  host: EngineHost;
  registry: WorkspaceRegistry;
  selector: ModelSelector;
  /** 无人使用多久后释放运行时，默认 30 分钟；0 = 不释放 */
  idleMs?: number;
  /** 无头：审批全部放行（测试用） */
  headless?: boolean;
}

export interface WorkspaceView extends WorkspaceRecord {
  loaded: boolean;
  isProject: boolean;
  exists: boolean;
}

interface Loaded {
  runtime: KeelRuntime;
  lastUsedAt: number;
}

type LoadListener = (id: string, runtime: KeelRuntime) => void;

export class WorkspaceManager {
  private readonly loaded = new Map<string, Loaded>();
  private readonly loading = new Map<string, Promise<KeelRuntime>>();
  private readonly loadListeners = new Set<LoadListener>();
  private readonly unloadListeners = new Set<(id: string) => void>();
  private readonly changedListeners = new Set<() => void>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: WorkspaceManagerOptions) {
    const idle = options.idleMs ?? 30 * 60 * 1000;
    if (idle > 0) {
      this.timer = setInterval(() => void this.sweep(), Math.min(idle, 60_000));
      this.timer.unref();
    }
  }

  get registry(): WorkspaceRegistry {
    return this.options.registry;
  }

  onLoaded(fn: LoadListener): () => void {
    this.loadListeners.add(fn);
    return () => this.loadListeners.delete(fn);
  }

  onUnloaded(fn: (id: string) => void): () => void {
    this.unloadListeners.add(fn);
    return () => this.unloadListeners.delete(fn);
  }

  /** 注册表变化（加入 / 移除） */
  onChanged(fn: () => void): () => void {
    this.changedListeners.add(fn);
    return () => this.changedListeners.delete(fn);
  }

  list(): WorkspaceView[] {
    return this.options.registry.list().map((w) => this.view(w));
  }

  view(w: WorkspaceRecord): WorkspaceView {
    let exists = true;
    let isProject = false;
    try {
      isProject = isProjectDir(w.path);
    } catch {
      exists = false;
    }
    return { ...w, loaded: this.loaded.has(w.id), isProject, exists };
  }

  record(id: string): WorkspaceRecord | undefined {
    return this.options.registry.get(id);
  }

  /** 已加载的运行时（不触发加载） */
  peek(id: string): KeelRuntime | undefined {
    return this.loaded.get(id)?.runtime;
  }

  loadedIds(): string[] {
    return [...this.loaded.keys()];
  }

  /** 拿到工作区运行时，没加载就现在加载。未注册返回 undefined。 */
  async get(id: string): Promise<KeelRuntime | undefined> {
    const hit = this.loaded.get(id);
    if (hit) {
      hit.lastUsedAt = Date.now();
      return hit.runtime;
    }
    const pending = this.loading.get(id);
    if (pending) return pending;
    const record = this.options.registry.get(id);
    if (!record) return undefined;
    const p = (async () => {
      const runtime = await createKeelRuntime({
        cwd: record.path,
        host: this.options.host,
        selector: this.options.selector,
        headless: this.options.headless ?? false,
      });
      this.loaded.set(id, { runtime, lastUsedAt: Date.now() });
      this.loading.delete(id);
      this.options.registry.touch(id);
      for (const l of this.loadListeners) l(id, runtime);
      return runtime;
    })();
    this.loading.set(id, p);
    p.catch(() => this.loading.delete(id));
    return p;
  }

  touch(id: string): void {
    const hit = this.loaded.get(id);
    if (hit) hit.lastUsedAt = Date.now();
  }

  add(path: string, name?: string): WorkspaceView {
    const record = this.options.registry.add(path, name);
    for (const l of this.changedListeners) l();
    return this.view(record);
  }

  async remove(id: string): Promise<boolean> {
    await this.unload(id);
    const ok = this.options.registry.remove(id);
    if (ok) for (const l of this.changedListeners) l();
    return ok;
  }

  async unload(id: string): Promise<void> {
    const hit = this.loaded.get(id);
    if (!hit) return;
    this.loaded.delete(id);
    for (const l of this.unloadListeners) l(id);
    await hit.runtime.dispose();
  }

  /** 释放闲置运行时：超过 idleMs 没人碰、也没有会话在跑。 */
  async sweep(now = Date.now()): Promise<string[]> {
    const idle = this.options.idleMs ?? 30 * 60 * 1000;
    if (idle <= 0) return [];
    const released: string[] = [];
    for (const [id, l] of [...this.loaded]) {
      if (now - l.lastUsedAt < idle) continue;
      const busy = l.runtime.engine.sessions.liveAll().some((s) => s.getState().isStreaming);
      if (busy) continue;
      await this.unload(id);
      released.push(id);
    }
    return released;
  }

  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    for (const id of [...this.loaded.keys()]) await this.unload(id);
  }
}
