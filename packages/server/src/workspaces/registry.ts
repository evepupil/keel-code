/**
 * 工作区注册表：~/.keel/workspaces.json，记录用户打开过的项目目录。
 * 每次读写都走文件（数据很小），多进程 / 多次启动天然一致。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { projectDirName } from "@keel-code/engine";

export interface WorkspaceRecord {
  /** 稳定 id：<目录名>-<路径 hash>，与会话目录同名 */
  id: string;
  path: string;
  name: string;
  addedAt: string;
  lastOpenedAt: string;
}

/** 目录是不是一个项目：有 .git 或 .keel 就算 */
export function isProjectDir(path: string): boolean {
  return existsSync(resolve(path, ".git")) || existsSync(resolve(path, ".keel"));
}

export function workspaceIdOf(path: string): string {
  return projectDirName(path);
}

export class WorkspaceRegistry {
  constructor(private readonly file: string) {}

  list(): WorkspaceRecord[] {
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(
          (r): r is WorkspaceRecord =>
            !!r && typeof r === "object" && typeof (r as WorkspaceRecord).path === "string",
        )
        .map((r) => ({
          id: r.id || workspaceIdOf(r.path),
          path: r.path,
          name: r.name || basename(r.path),
          addedAt: r.addedAt ?? new Date(0).toISOString(),
          lastOpenedAt: r.lastOpenedAt ?? r.addedAt ?? new Date(0).toISOString(),
        }))
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
    } catch {
      return [];
    }
  }

  get(id: string): WorkspaceRecord | undefined {
    return this.list().find((w) => w.id === id);
  }

  /** 加入（已存在则只更新 lastOpenedAt）；目录不存在会抛错。 */
  add(path: string, name?: string, now = new Date()): WorkspaceRecord {
    const abs = resolve(path);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new Error(`目录不存在：${abs}`);
    }
    const id = workspaceIdOf(abs);
    const list = this.list();
    const existing = list.find((w) => w.id === id);
    const stamp = now.toISOString();
    if (existing) {
      existing.lastOpenedAt = stamp;
      if (name) existing.name = name;
      this.write(list);
      return existing;
    }
    const record: WorkspaceRecord = {
      id,
      path: abs,
      name: name || basename(abs),
      addedAt: stamp,
      lastOpenedAt: stamp,
    };
    this.write([record, ...list]);
    return record;
  }

  remove(id: string): boolean {
    const list = this.list();
    const next = list.filter((w) => w.id !== id);
    if (next.length === list.length) return false;
    this.write(next);
    return true;
  }

  touch(id: string, now = new Date()): void {
    const list = this.list();
    const w = list.find((x) => x.id === id);
    if (!w) return;
    w.lastOpenedAt = now.toISOString();
    this.write(list);
  }

  private write(list: WorkspaceRecord[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
    renameSync(tmp, this.file);
  }
}
