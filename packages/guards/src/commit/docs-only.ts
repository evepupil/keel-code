import { execFile } from "node:child_process";

/** 纯文档路径：docs/ 与 .keel/ 下的任何文件，或任意位置的 .md */
export function isDocPath(path: string): boolean {
  const p = path.replace(/\\/g, "/").replace(/^"|"$/g, "");
  return p.startsWith("docs/") || p.startsWith(".keel/") || /\.md$/i.test(p);
}

/** 工作树里全部改动（staged + unstaged + untracked）的路径。 */
export function changedPaths(cwd: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain", "-uall"],
      { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        const paths = stdout
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => l.slice(3).trim())
          .map((p) => (p.includes(" -> ") ? (p.split(" -> ")[1] ?? p) : p));
        resolve(paths);
      },
    );
  });
}

/** 工作树的改动是否全是文档（空改动也算 true）。 */
export function isDocsOnlyChange(paths: string[]): boolean {
  return paths.every(isDocPath);
}
