import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { KeelSettings } from "./types.js";

/** ~/.keel/settings.json：keel 自身设置（不含凭据）。缺失或损坏按空处理。 */
export function readSettings(file: string): KeelSettings {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as KeelSettings;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function writeSettings(file: string, settings: KeelSettings): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tmp, file);
}

export function mergeSettings(base: KeelSettings, patch: Partial<KeelSettings>): KeelSettings {
  const out: KeelSettings = { ...base };
  if (patch.modelLocks !== undefined) {
    out.modelLocks = { ...(base.modelLocks ?? {}) };
    for (const [k, v] of Object.entries(patch.modelLocks)) {
      if (v === null || v === undefined) delete out.modelLocks[k];
      else out.modelLocks[k] = v;
    }
  }
  if (patch.cacheTtlMs !== undefined)
    out.cacheTtlMs = { ...(base.cacheTtlMs ?? {}), ...patch.cacheTtlMs };
  if (patch.acceptance !== undefined) out.acceptance = patch.acceptance;
  return out;
}
