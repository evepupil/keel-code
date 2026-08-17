/**
 * keel-code CLI：init / serve / status / doctor。
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "@keel-code/engine";
import { startServer } from "@keel-code/server";
import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { initProject } from "./commands/init.js";
import { openBrowser } from "./util/open-browser.js";
import { findWebDist } from "./util/web-dist.js";

export const PACKAGE_NAME = "keel-code" as const;

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("keel")
    .description("keel-code：把工程方法论焊进基础设施的编程 agent 工具")
    .version(readVersion())
    .option("-C, --cwd <dir>", "项目目录（默认当前目录）")
    .option("--home <dir>", "keel 用户目录（默认 ~/.keel）");

  const opts = () => {
    const o = program.opts<{ cwd?: string; home?: string }>();
    return { cwd: resolve(o.cwd ?? process.cwd()), home: o.home };
  };

  program
    .command("init")
    .description("初始化项目：.keel/ 与 docs/ 骨架（不覆盖已有文件）")
    .action(() => {
      const { cwd } = opts();
      const r = initProject(cwd);
      for (const f of r.created) console.log(`  + ${f}`);
      for (const f of r.skipped) console.log(`  = ${f}（已存在，跳过）`);
      console.log(`\nkeel 已初始化：${cwd}\n下一步：keel serve`);
    });

  program
    .command("serve")
    .description("启动本地服务并打开 Web 工作台")
    .option("-p, --port <n>", "端口（0 = 自动挑空闲端口）", "3131")
    .option("--no-open", "不自动打开浏览器")
    .action(async (o: { port: string; open: boolean }) => {
      const { cwd, home } = opts();
      const staticDir = findWebDist();
      if (!staticDir) {
        console.warn(
          "未找到 Web 工作台构建产物，只提供 API（开发时先 pnpm --filter @keel-code/web build）",
        );
      }
      const server = await startServer({
        cwd,
        ...(home ? { homeDir: home } : {}),
        port: Number(o.port),
        ...(staticDir ? { staticDir } : {}),
        version: readVersion(),
      });
      console.log(`keel 工作台：${server.url}`);
      console.log(`项目：${cwd}`);
      if (o.open && staticDir) openBrowser(server.url);
      const shutdown = async () => {
        await server.close();
        process.exit(0);
      };
      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());
    });

  program
    .command("status")
    .description("列出当前项目的对话")
    .action(async () => {
      const { cwd, home } = opts();
      const engine = await createEngine(home ? { cwd, homeDir: home } : { cwd });
      try {
        const list = await engine.sessions.list();
        if (list.length === 0) {
          console.log("还没有对话。运行 keel serve 开始。");
          return;
        }
        for (const r of list) {
          const m = r.meta;
          console.log(
            `${m.kind.padEnd(12)} ${m.title.padEnd(20)} ${m.model.provider}/${m.model.id}  消息 ${r.messageCount}  最近 ${r.lastActiveAt}${m.archived ? "  [已归档]" : ""}`,
          );
        }
      } finally {
        await engine.dispose();
      }
    });

  program
    .command("doctor")
    .description("环境自检：Node、git、bash、用户目录、模型 provider")
    .action(async () => {
      const { cwd, home } = opts();
      const checks = await runDoctor(cwd, home);
      for (const c of checks) console.log(`${c.ok ? "OK  " : "FAIL"} ${c.name}：${c.detail}`);
      if (checks.some((c) => !c.ok)) process.exitCode = 1;
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}
