/**
 * 设置页用的提供方目录：读写 models.json，并同步到进程内 ModelRuntime。
 */
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
  BuiltinProviderOption,
  CatalogModel,
  CatalogProvider,
  ProviderInfo,
  UpsertProviderInput,
} from "../types.js";
import {
  catalogOf,
  isKnownApi,
  readModelsFile,
  removeCatalog,
  upsertCatalog,
  validateProviderId,
  writeModelsFile,
} from "./catalog.js";
import { buildModelsRequest, parseModelIds } from "./probe.js";
import { listProviders } from "./runtime.js";

export function addedProviders(runtime: ModelRuntime, modelsPath: string): ProviderInfo[] {
  const file = readModelsFile(modelsPath);
  const all = listProviders(runtime);
  return all
    .filter((p) => p.id in file.providers)
    .map((p) => decorate(runtime, p, file.providers[p.id]?.api));
}

export function unusedBuiltins(runtime: ModelRuntime, modelsPath: string): BuiltinProviderOption[] {
  const added = new Set(Object.keys(readModelsFile(modelsPath).providers));
  const out: BuiltinProviderOption[] = [];
  for (const p of runtime.getProviders()) {
    if (added.has(p.id)) continue;
    // 自定义提供方只活在 models.json 里；这里剩下的是 pi 内置目录
    const opt: BuiltinProviderOption = { id: p.id, name: p.name };
    if (p.baseUrl) opt.baseUrl = p.baseUrl;
    out.push(opt);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function readCatalog(modelsPath: string, providerId: string): CatalogProvider | undefined {
  return catalogOf(readModelsFile(modelsPath), providerId);
}

export async function upsertProvider(
  runtime: ModelRuntime,
  modelsPath: string,
  input: UpsertProviderInput,
): Promise<ProviderInfo> {
  const idErr = validateProviderId(input.id);
  if (idErr) throw new Error(idErr);
  if (input.api && !isKnownApi(input.api)) throw new Error(`不支持的 API 协议：${input.api}`);

  const native = runtime.getRegisteredNativeProvider(input.id);
  if (input.kind === "builtin" && !native) {
    throw new Error(`「${input.id}」不是内置提供方，请走「添加自定义提供方」`);
  }
  if (input.kind === "custom" && native) {
    throw new Error(`「${input.id}」是内置提供方，请走「添加提供方」`);
  }
  if (input.kind === "custom") {
    if (!input.baseUrl?.trim()) throw new Error("自定义提供方必须填 API 地址");
    if (!input.api) throw new Error("自定义提供方必须选 API 协议");
  }

  const file = upsertCatalog(readModelsFile(modelsPath), input.id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    ...(input.api !== undefined ? { api: input.api } : {}),
    ...(input.models !== undefined ? { models: input.models } : {}),
  });
  writeModelsFile(modelsPath, file);

  const body = file.providers[input.id];
  runtime.registerProvider(input.id, {
    ...(body?.name ? { name: body.name } : {}),
    ...(body?.baseUrl ? { baseUrl: body.baseUrl } : {}),
    ...(body?.api ? { api: body.api as never } : {}),
    ...(body?.models
      ? {
          models: toRuntimeModels(
            body.models.filter((m) => m.enabled !== false),
            body.api,
            body.baseUrl,
          ),
        }
      : {}),
  });

  if (input.apiKey?.trim()) {
    await runtime.setRuntimeApiKey(input.id, input.apiKey.trim());
  }

  const info = listProviders(runtime).find((p) => p.id === input.id);
  if (!info) throw new Error(`写入后找不到提供方 ${input.id}`);
  return decorate(runtime, info, body?.api);
}

export async function removeProvider(
  runtime: ModelRuntime,
  modelsPath: string,
  providerId: string,
): Promise<void> {
  writeModelsFile(modelsPath, removeCatalog(readModelsFile(modelsPath), providerId));
  try {
    runtime.unregisterProvider(providerId);
  } catch {
    // 内置提供方 unregister 可能拒绝，忽略——从 models.json 拿掉就够
  }
  try {
    await runtime.removeRuntimeApiKey(providerId);
  } catch {
    // 没有存过 key
  }
}

export async function fetchRemoteModels(
  runtime: ModelRuntime,
  modelsPath: string,
  input: {
    providerId?: string;
    baseUrl?: string;
    api?: string;
    apiKey?: string;
  },
): Promise<{ id: string }[]> {
  let baseUrl = input.baseUrl?.trim();
  let api = input.api;
  let apiKey = input.apiKey?.trim();

  if (input.providerId) {
    const p = runtime.getProvider(input.providerId);
    const first = runtime.getModels(input.providerId)[0];
    const cat = catalogOf(readModelsFile(modelsPath), input.providerId);
    const nativeUrl = p?.baseUrl ?? first?.baseUrl;
    const formUrl = input.baseUrl?.trim();
    // 表单若还是官方默认地址，优先用目录里用户改过的端点
    if (!baseUrl || (nativeUrl && formUrl === nativeUrl && cat?.baseUrl)) {
      baseUrl = cat?.baseUrl ?? formUrl ?? nativeUrl;
    }
    if (!api) api = cat?.api ?? first?.api;
    if (!apiKey) {
      try {
        const auth = await runtime.getAuth(input.providerId);
        apiKey = auth?.auth.apiKey;
      } catch {
        // 没存过 key
      }
    }
  }

  if (!baseUrl) throw new Error("没有 API 地址，填了再获取");
  if (!api) throw new Error("不知道用哪种协议列模型");

  const req = buildModelsRequest(api, baseUrl, apiKey);
  if (!req) throw new Error(`协议 ${api} 不知道怎么列模型`);
  const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`列模型失败：HTTP ${res.status}`);
  const ids = [...parseModelIds((await res.json()) as unknown)];
  return ids.map((id) => ({ id }));
}

function decorate(runtime: ModelRuntime, p: ProviderInfo, api?: string): ProviderInfo {
  const native = !!runtime.getRegisteredNativeProvider(p.id);
  const first = runtime.getModels(p.id)[0];
  return {
    ...p,
    kind: native ? "builtin" : "custom",
    added: true,
    ...(api || first?.api ? { api: api ?? first?.api } : {}),
  };
}

function toRuntimeModels(
  models: CatalogModel[],
  api: string | undefined,
  baseUrl: string | undefined,
) {
  return models.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    reasoning: m.reasoning ?? false,
    input: m.input ?? (["text"] as ("text" | "image")[]),
    cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow ?? 128000,
    maxTokens: m.maxTokens ?? 8192,
    ...(api ? { api: api as never } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  }));
}
