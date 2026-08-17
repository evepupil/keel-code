import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** 把相对路径解析到项目内；越界（../）或绝对路径指向外面 → 抛错。返回绝对路径。 */
export function resolveInside(cwd: string, rel: string): string {
  const abs = resolve(cwd, rel);
  const r = relative(resolve(cwd), abs);
  if (r.startsWith("..") || r === "" || (r.includes(":") && !r.startsWith("."))) {
    if (r === "") throw new Error("路径不能是项目根目录本身");
    throw new Error(`路径越出项目目录：${rel}`);
  }
  return abs;
}

/** 文档写入只允许 docs/ 与 .keel/ 下的 markdown / json。 */
export function isWritableDocPath(rel: string): boolean {
  const p = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  return (
    (p.startsWith("docs/") || p.startsWith(".keel/")) &&
    /\.(md|json)$/i.test(p) &&
    !p.includes("..")
  );
}

export function readDoc(cwd: string, rel: string): string {
  return readFileSync(resolveInside(cwd, rel), "utf8");
}

export function writeDoc(cwd: string, rel: string, content: string): void {
  if (!isWritableDocPath(rel))
    throw new Error(`只允许写 docs/ 与 .keel/ 下的 markdown / json：${rel}`);
  const abs = resolveInside(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

export interface DocFile {
  path: string;
  size: number;
  mtime: string;
}

/** 递归列出目录下的 markdown（相对项目根，正斜杠）。 */
export function listDocs(cwd: string, dir = "docs"): DocFile[] {
  const root = resolveInside(cwd, dir);
  if (!existsSync(root)) return [];
  const out: DocFile[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        walk(abs);
      } else if (/\.md$/i.test(name)) {
        out.push({
          path: relative(cwd, abs).split(sep).join("/"),
          size: st.size,
          mtime: st.mtime.toISOString(),
        });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
