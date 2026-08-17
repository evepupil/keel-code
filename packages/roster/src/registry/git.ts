import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

function run(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? undefined : stdout),
    );
  });
}

/** 当前 HEAD 的 commit（非 git 仓库返回 undefined）。 */
export async function currentCommit(cwd: string): Promise<string | undefined> {
  const out = await run(cwd, ["rev-parse", "HEAD"]);
  return out?.trim() || undefined;
}

/**
 * 代码范围指纹：已跟踪文件的 blob 哈希 + 未提交改动的 porcelain 状态，取 sha256 前 16 位。
 * 范围为空 = 整个仓库。非 git 仓库返回 undefined。
 */
export async function codeHash(cwd: string, globs: string[] = []): Promise<string | undefined> {
  const paths = globs.length > 0 ? ["--", ...globs] : [];
  const tracked = await run(cwd, ["ls-files", "-s", ...paths]);
  if (tracked === undefined) return undefined;
  const status = (await run(cwd, ["status", "--porcelain", ...paths])) ?? "";
  return createHash("sha256").update(tracked).update(" ").update(status).digest("hex").slice(0, 16);
}
