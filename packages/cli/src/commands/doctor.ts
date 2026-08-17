import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { createEngine, resolveKeelPaths } from "@keel-code/engine";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const MIN_NODE = [22, 19, 0] as const;

function compareVersion(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function checkNode(version = process.versions.node): DoctorCheck {
  const parts = version.split(".").map((n) => Number.parseInt(n, 10));
  const ok = compareVersion(parts, MIN_NODE) >= 0;
  return {
    name: "Node.js",
    ok,
    detail: ok ? `v${version}` : `v${version}，需要 ≥ v${MIN_NODE.join(".")}`,
  };
}

export function checkGit(): DoctorCheck {
  try {
    const out = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
    return { name: "git", ok: true, detail: out };
  } catch {
    return { name: "git", ok: false, detail: "未找到 git，请安装 Git" };
  }
}

export function checkBash(): DoctorCheck {
  if (process.platform !== "win32") {
    return { name: "bash", ok: true, detail: "非 Windows，跳过" };
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found) return { name: "bash（Git for Windows）", ok: true, detail: found };
  try {
    execFileSync("bash", ["--version"], { encoding: "utf8" });
    return { name: "bash", ok: true, detail: "PATH 里的 bash" };
  } catch {
    return {
      name: "bash（Git for Windows）",
      ok: false,
      detail: "未找到 bash.exe，bash 工具将不可用；请安装 Git for Windows",
    };
  }
}

export function checkHome(cwd: string, homeDir?: string): DoctorCheck {
  const paths = resolveKeelPaths(cwd, homeDir);
  try {
    mkdirSync(paths.home, { recursive: true });
    accessSync(paths.home, constants.W_OK);
    return { name: "keel 用户目录", ok: true, detail: paths.home };
  } catch {
    return { name: "keel 用户目录", ok: false, detail: `${paths.home} 不可写` };
  }
}

export async function checkProviders(cwd: string, homeDir?: string): Promise<DoctorCheck> {
  const engine = await createEngine(homeDir ? { cwd, homeDir } : { cwd });
  try {
    const configured = engine.models.providers().filter((p) => p.configured);
    const available = await engine.models.available();
    const ok = available.length > 0;
    return {
      name: "模型 provider",
      ok,
      detail: ok
        ? `已配置 ${configured.map((p) => p.id).join(", ")}，可用模型 ${available.length} 个`
        : "没有已配置凭据的 provider：设置环境变量（如 ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY）或在 Web 设置里填 key",
    };
  } finally {
    await engine.dispose();
  }
}

export async function runDoctor(cwd: string, homeDir?: string): Promise<DoctorCheck[]> {
  return [
    checkNode(),
    checkGit(),
    checkBash(),
    checkHome(cwd, homeDir),
    await checkProviders(cwd, homeDir),
  ];
}
