/**
 * commit-gate：bash 里出现 `git commit` 时——
 * ① 必须存在 review-pass 记录且当前工作树指纹一致（review 之后又改了代码 = 拒）；
 * ② 项目自身门禁（package.json 的 gate / typecheck / lint / test；Rust 的 cargo）通过。
 * 判定是纯函数，执行门禁的部分单独可替换。
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReviewState } from "@keel-code/loop";

// git commit 的识别与闭环包共用（闭环包据此在提交后刷新 credit）
export { extractCommand, GIT_COMMIT_RE, isGitCommit } from "@keel-code/loop";

export interface CreditJudgeInput {
  reviewState: ReviewState;
  currentTree: string;
}

/** review credit 判定：返回拒绝原因；undefined = 放行。 */
export function judgeReviewCredit(i: CreditJudgeInput): string | undefined {
  const pass = i.reviewState.lastPass;
  if (!pass) {
    return [
      "keel commit-gate 拦截：没有 review 通过记录。",
      "实现完成后先调用 keel_batch_report 走 review 闭环，通过后再提交。",
      "逃生舱：.keel/config.json → guards.commitGate=false（关闭动作会留在仓库里）。",
    ].join("\n");
  }
  if (pass.tree !== i.currentTree) {
    return [
      `keel commit-gate 拦截：review 通过（${pass.at}，批次「${pass.batch.slice(0, 40)}」）之后代码又被修改（tree ${pass.tree} → ${i.currentTree}）。`,
      "重新调用 keel_batch_report 复核后再提交。",
    ].join("\n");
  }
  return undefined;
}

// ---------- 项目自身门禁 ----------

export interface ProjectGateResult {
  ok: boolean;
  ran: string[];
  output: string;
}

function run(
  cwd: string,
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd,
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        shell: process.platform === "win32",
      },
      (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout ?? ""}${stderr ?? ""}` }),
    );
  });
}

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

/**
 * 跑项目门禁：有 `gate` 脚本就只跑它；否则依次跑存在的 typecheck / lint / test；有 Cargo.toml 再跑 cargo clippy + test。
 * 任何一步失败即整体失败，返回输出尾部供模型定位。
 */
export async function runProjectGate(
  cwd: string,
  timeoutMs = 10 * 60 * 1000,
): Promise<ProjectGateResult> {
  const ran: string[] = [];
  let output = "";
  const pkgFile = join(cwd, "package.json");
  if (existsSync(pkgFile)) {
    let scripts: Record<string, string> = {};
    try {
      scripts =
        (JSON.parse(readFileSync(pkgFile, "utf8")) as { scripts?: Record<string, string> })
          .scripts ?? {};
    } catch {
      scripts = {};
    }
    const pm = detectPackageManager(cwd);
    const names = scripts.gate ? ["gate"] : ["typecheck", "lint", "test"].filter((n) => scripts[n]);
    for (const name of names) {
      ran.push(`${pm} run ${name}`);
      const r = await run(cwd, pm, ["run", name], timeoutMs);
      output += `\n$ ${pm} run ${name}\n${tail(r.out)}`;
      if (!r.ok) return { ok: false, ran, output };
    }
  }
  if (existsSync(join(cwd, "Cargo.toml"))) {
    for (const args of [
      ["clippy", "--all-targets", "--", "-D", "warnings"],
      ["test", "--all-targets"],
    ]) {
      ran.push(`cargo ${args[0]}`);
      const r = await run(cwd, "cargo", args, timeoutMs);
      output += `\n$ cargo ${args.join(" ")}\n${tail(r.out)}`;
      if (!r.ok) return { ok: false, ran, output };
    }
  }
  return { ok: true, ran, output };
}

function tail(s: string, n = 4000): string {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
