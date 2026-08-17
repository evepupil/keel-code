/**
 * ~/.keel/models.json 读写。密钥不进这个文件（走 auth.json / setApiKey）。
 * 设置页「添加 / 编辑提供方」都写这里；列表只显示这里有的。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { CatalogModel, CatalogProvider } from "../types.js";

export interface ModelsFile {
  providers: Record<string, CatalogProviderBody>;
}

export interface CatalogProviderBody {
  name?: string;
  baseUrl?: string;
  api?: string;
  headers?: Record<string, string>;
  /** 兼容 pi 的内联密钥（测试夹具用它）；keel 自己的 UI 流程密钥走 auth.json */
  apiKey?: string;
  models?: CatalogModel[];
}

/** 请求头默认值：不少中转网关按 User-Agent 拦官方 SDK 标识（403 Your request was blocked）。 */
export const DEFAULT_USER_AGENT = "keel-code";

/**
 * 给没有 user-agent 的提供方补默认值。返回是否改动了文件（需要写回）。
 * 用户自己写过的 headers 不动。
 */
export function backfillDefaultHeaders(file: ModelsFile): boolean {
  let changed = false;
  for (const body of Object.values(file.providers)) {
    const hasUa = Object.keys(body.headers ?? {}).some((k) => k.toLowerCase() === "user-agent");
    if (hasUa) continue;
    body.headers = { ...(body.headers ?? {}), "user-agent": DEFAULT_USER_AGENT };
    changed = true;
  }
  return changed;
}

export const PROVIDER_ID_RE = /^[a-z][a-z0-9_-]{0,62}$/;

export const APIS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;

export function isKnownApi(api: string): boolean {
  return (APIS as readonly string[]).includes(api);
}

export function validateProviderId(id: string): string | undefined {
  if (!PROVIDER_ID_RE.test(id)) {
    return "Provider ID 须以小写字母开头，只含小写字母、数字、连字符和下划线";
  }
  return undefined;
}

export function emptyModelsFile(): ModelsFile {
  return { providers: {} };
}

export function readModelsFile(path: string): ModelsFile {
  if (!existsSync(path)) return emptyModelsFile();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { providers?: unknown };
    if (!raw || typeof raw !== "object" || !raw.providers || typeof raw.providers !== "object") {
      return emptyModelsFile();
    }
    const providers: Record<string, CatalogProviderBody> = {};
    for (const [id, body] of Object.entries(raw.providers as Record<string, unknown>)) {
      if (!body || typeof body !== "object") continue;
      providers[id] = sanitizeBody(body as Record<string, unknown>);
    }
    return { providers };
  } catch {
    return emptyModelsFile();
  }
}

export function writeModelsFile(path: string, file: ModelsFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

export function catalogOf(file: ModelsFile, id: string): CatalogProvider | undefined {
  const body = file.providers[id];
  if (!body) return undefined;
  return { id, ...body };
}

export function upsertCatalog(
  file: ModelsFile,
  id: string,
  patch: CatalogProviderBody,
): ModelsFile {
  const prev = file.providers[id] ?? {};
  const next: CatalogProviderBody = { ...prev };
  if (patch.name !== undefined) next.name = patch.name || undefined;
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl || undefined;
  if (patch.api !== undefined) next.api = patch.api || undefined;
  if (patch.headers !== undefined) next.headers = patch.headers;
  if (patch.models !== undefined) next.models = patch.models;
  return { providers: { ...file.providers, [id]: next } };
}

/** 选择器只认 models.json 里勾过的：没加提供方、或目录为空，都不进列表。 */
export function visibleModelsOf<T extends { provider: string; id: string }>(
  models: T[],
  file: ModelsFile,
): T[] {
  return models.filter((m) => {
    const allowed = file.providers[m.provider]?.models;
    return !!allowed?.some((x) => x.id === m.id && x.enabled !== false);
  });
}

export function removeCatalog(file: ModelsFile, id: string): ModelsFile {
  if (!(id in file.providers)) return file;
  const { [id]: _drop, ...rest } = file.providers;
  return { providers: rest };
}

function sanitizeBody(raw: Record<string, unknown>): CatalogProviderBody {
  const models = Array.isArray(raw.models)
    ? raw.models
        .filter(
          (m): m is Record<string, unknown> =>
            !!m && typeof m === "object" && typeof m.id === "string",
        )
        .map((m) => sanitizeModel(m))
    : undefined;
  const headers =
    raw.headers && typeof raw.headers === "object"
      ? Object.fromEntries(
          Object.entries(raw.headers as Record<string, unknown>).filter(
            (kv): kv is [string, string] => typeof kv[1] === "string",
          ),
        )
      : undefined;
  return {
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.baseUrl === "string" ? { baseUrl: raw.baseUrl } : {}),
    ...(typeof raw.api === "string" ? { api: raw.api } : {}),
    ...(typeof raw.apiKey === "string" ? { apiKey: raw.apiKey } : {}),
    ...(headers ? { headers } : {}),
    ...(models ? { models } : {}),
  };
}

function sanitizeModel(raw: Record<string, unknown>): CatalogModel {
  const input = Array.isArray(raw.input)
    ? raw.input.filter((x): x is "text" | "image" => x === "text" || x === "image")
    : undefined;
  const cost =
    raw.cost && typeof raw.cost === "object" ? (raw.cost as CatalogModel["cost"]) : undefined;
  return {
    id: String(raw.id),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(typeof raw.reasoning === "boolean" ? { reasoning: raw.reasoning } : {}),
    ...(input && input.length > 0 ? { input } : {}),
    ...(cost ? { cost } : {}),
    ...(typeof raw.contextWindow === "number" ? { contextWindow: raw.contextWindow } : {}),
    ...(typeof raw.maxTokens === "number" ? { maxTokens: raw.maxTokens } : {}),
  };
}
