import { type RunningServer, readWebState, startServer } from "@keel-code/server";
import { makeTempKeelHome, makeTempProject, type TempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import { runWebCommand } from "./web.js";

let server: RunningServer | undefined;
let home: TempDir | undefined;
let first: TempDir | undefined;
let second: TempDir | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  first?.cleanup();
  second?.cleanup();
  home?.cleanup();
  first = undefined;
  second = undefined;
  home = undefined;
});

describe("keel web", () => {
  it("复用单个后台实例并注册第二个项目", async () => {
    home = makeTempKeelHome({ baseUrl: "http://127.0.0.1:9", models: ["mock-1"] });
    first = makeTempProject({ git: true });
    second = makeTempProject({ git: true });
    server = await startServer({
      cwd: first.path,
      homeDir: home.path,
      port: 0,
      idleMs: 0,
      headless: true,
      writeWebState: true,
    });
    const initialState = readWebState(home.path);
    if (!initialState) throw new Error("工作台启动后应写入 web.json");

    const logs: string[] = [];
    const code = await runWebCommand({
      dir: second.path,
      homeDir: home.path,
      port: 3131,
      open: false,
      foreground: true,
      stop: false,
      version: "test",
      log: (line) => logs.push(line),
    });

    expect(code).toBe(0);
    const reusedState = readWebState(home.path);
    expect(reusedState).toMatchObject({ pid: initialState.pid, port: initialState.port });
    expect(logs.some((line) => line.includes("工作台已在运行"))).toBe(true);
    expect(logs.some((line) => line.includes("#/w/"))).toBe(true);

    const response = await fetch(`http://${server.host}:${server.port}/api/workspaces`, {
      headers: { "x-keel-token": server.token },
    });
    const workspaces = (await response.json()) as { path: string }[];
    expect(workspaces.map((workspace) => workspace.path)).toEqual(
      expect.arrayContaining([first.path, second.path]),
    );
  });
});
