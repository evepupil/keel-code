import { join } from "node:path";
import { createEngineHost, type EngineHost } from "@keel-code/engine";
import { ModelSelector } from "@keel-code/roster";
import { makeTempKeelHome, makeTempProject, type TempDir } from "@keel-code/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkspaceManager } from "./manager.js";
import { WorkspaceRegistry } from "./registry.js";

let home: TempDir;
let project: TempDir;
let host: EngineHost;

beforeAll(async () => {
  home = makeTempKeelHome({ baseUrl: "http://127.0.0.1:9", models: ["mock-1"] });
  project = makeTempProject();
  host = await createEngineHost({ homeDir: home.path });
});

afterAll(async () => {
  await host.dispose();
  project.cleanup();
  home.cleanup();
});

describe("WorkspaceManager", () => {
  it("懒加载、事件、闲置释放、移除", async () => {
    const registry = new WorkspaceRegistry(join(home.path, "workspaces.json"));
    const manager = new WorkspaceManager({
      host,
      registry,
      selector: new ModelSelector(host),
      idleMs: 1000,
      headless: true,
    });
    const loaded: string[] = [];
    const unloaded: string[] = [];
    manager.onLoaded((id) => loaded.push(id));
    manager.onUnloaded((id) => unloaded.push(id));

    expect(await manager.get("nope")).toBeUndefined();
    const view = manager.add(project.path);
    expect(view.loaded).toBe(false);
    const rt = await manager.get(view.id);
    expect(rt?.engine.cwd).toBe(project.path);
    expect(loaded).toEqual([view.id]);
    expect(manager.list()[0]?.loaded).toBe(true);
    // 并发 get 拿到同一个
    expect(await manager.get(view.id)).toBe(rt);

    // 没到闲置时间不释放；到了就释放
    expect(await manager.sweep(Date.now())).toEqual([]);
    expect(await manager.sweep(Date.now() + 5000)).toEqual([view.id]);
    expect(unloaded).toEqual([view.id]);
    expect(manager.peek(view.id)).toBeUndefined();
    // 再拿会重新加载
    expect((await manager.get(view.id))?.engine.cwd).toBe(project.path);

    expect(await manager.remove(view.id)).toBe(true);
    expect(manager.list()).toEqual([]);
    await manager.dispose();
  });
});
