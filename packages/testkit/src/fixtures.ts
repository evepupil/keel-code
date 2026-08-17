/**
 * 测试夹具：临时项目目录、临时 keel 用户目录（含指向 mock 服务的 models.json）。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDir {
  path: string;
  cleanup(): void;
}

export function makeTempDir(prefix = "keel-test-"): TempDir {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return {
    path,
    cleanup: () => {
      try {
        rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Windows 偶发文件占用，忽略
      }
    },
  };
}

export interface TempProjectOptions {
  /** git init；有预置文件时顺手提交一次 init */
  git?: boolean;
  files?: Record<string, string>;
}

/** 建一个临时项目目录，可选 git init（含首个 commit）与预置文件。 */
export function makeTempProject(options: TempProjectOptions = {}): TempDir {
  const dir = makeTempDir("keel-proj-");
  for (const [rel, content] of Object.entries(options.files ?? {})) {
    const abs = join(dir.path, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  if (options.git) {
    execFileSync("git", ["init", "-q"], { cwd: dir.path });
    execFileSync("git", ["config", "user.email", "test@keel.local"], { cwd: dir.path });
    execFileSync("git", ["config", "user.name", "keel-test"], { cwd: dir.path });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir.path });
    if (options.files && Object.keys(options.files).length > 0) {
      execFileSync("git", ["add", "-A"], { cwd: dir.path });
      execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir.path });
    }
  }
  return dir;
}

export interface MockProviderSpec {
  /** provider id，默认 mock */
  id?: string;
  baseUrl: string;
  models?: string[];
}

/** 建一个临时 keel 用户目录，写入指向 mock 服务的 models.json。返回目录路径。 */
export function makeTempKeelHome(spec: MockProviderSpec): TempDir {
  const dir = makeTempDir("keel-home-");
  const id = spec.id ?? "mock";
  const models = spec.models ?? ["mock-1"];
  const modelsJson = {
    providers: {
      [id]: {
        name: "Mock",
        baseUrl: spec.baseUrl,
        apiKey: "mock-key",
        api: "openai-completions",
        models: models.map((m) => ({
          id: m,
          name: `Mock ${m}`,
          reasoning: false,
          input: ["text"],
          cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1 },
          contextWindow: 128000,
          maxTokens: 8192,
        })),
      },
    },
  };
  writeFileSync(join(dir.path, "models.json"), `${JSON.stringify(modelsJson, null, 2)}\n`);
  return dir;
}
