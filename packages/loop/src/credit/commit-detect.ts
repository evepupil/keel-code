/** 识别 bash 工具参数里的 `git commit`（含 `git -c k=v commit` 之类的全局选项）。 */
export const GIT_COMMIT_RE = /\bgit\s+(?:(?:-c\s+\S+|-\S+)\s+)*commit\b/;

export const SHELL_TOOL_RE = /bash|shell|pwsh|terminal|cmd/i;

export function extractCommand(input: Record<string, unknown>): string | undefined {
  for (const key of ["command", "cmd", "script"]) {
    const v = input[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

export function isGitCommit(command: string): boolean {
  return GIT_COMMIT_RE.test(command);
}
