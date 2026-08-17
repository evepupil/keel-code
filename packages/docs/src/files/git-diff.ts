import { execFile } from "node:child_process";

function git(cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-c", "core.quotepath=off", ...args],
      { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => resolve({ ok: !err, out: stdout ?? "" }),
    );
  });
}

/** 某个文件相对 HEAD 的未提交改动（无 git / 无改动 → 空串）。新文件返回整文件的 diff。 */
export async function fileDiff(cwd: string, rel: string): Promise<string> {
  const tracked = await git(cwd, ["ls-files", "--error-unmatch", "--", rel]);
  if (!tracked.ok) {
    // 未跟踪的新文件：用 --no-index 与空文件比
    const r = await git(cwd, ["diff", "--no-index", "--", "/dev/null", rel]);
    return r.out;
  }
  const r = await git(cwd, ["diff", "HEAD", "--", rel]);
  return r.out;
}

export async function shortHead(cwd: string): Promise<string | undefined> {
  const r = await git(cwd, ["rev-parse", "--short", "HEAD"]);
  return r.ok ? r.out.trim() : undefined;
}
