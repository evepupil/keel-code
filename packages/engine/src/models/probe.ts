import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ProbedModel, ProbeOptions, ProviderProbe } from "../types.js";
import { toModelInfo } from "./runtime.js";

const DEFAULT_TIMEOUT_MS = 6000;

interface EndpointListing {
  reachable: boolean;
  latencyMs: number;
  ids: Set<string>;
  status?: number;
  error?: string;
}

/** HTTP 状态码是否表示认证 / 授权被拒——端点能连上，但拿它发消息必被拒。 */
export function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

/** 根据 api 类型拼出「列模型」的 URL 与请求头。返回 undefined 表示不知道怎么列。 */
export function buildModelsRequest(
  api: string,
  baseUrl: string,
  apiKey: string | undefined,
  extraHeaders: Record<string, string> = {},
  options: { includeAnthropicVersion?: boolean } = {},
): { url: string; headers: Record<string, string> } | undefined {
  const base = baseUrl.replace(/\/+$/, "");
  if (api === "anthropic-messages") {
    const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
    const headers: Record<string, string> = {
      ...(options.includeAnthropicVersion === false ? {} : { "anthropic-version": "2023-06-01" }),
      ...extraHeaders,
    };
    if (options.includeAnthropicVersion === false) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "anthropic-version") delete headers[key];
      }
    }
    if (apiKey) headers["x-api-key"] = apiKey;
    return { url, headers };
  }
  if (api.startsWith("openai") || api === "azure-openai-responses") {
    const headers: Record<string, string> = { ...extraHeaders };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return { url: `${base}/models`, headers };
  }
  return undefined;
}

/** 解析 OpenAI / Anthropic 风格的模型列表响应，取出 id 集合。 */
export function parseModelIds(body: unknown): Set<string> {
  const ids = new Set<string>();
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data ?? [])
      : [];
  for (const item of list) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      ids.add((item as { id: string }).id);
    }
  }
  return ids;
}

async function listEndpointModels(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<EndpointListing> {
  const started = performance.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) {
      return {
        reachable: true,
        latencyMs,
        ids: new Set(),
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as unknown;
    return { reachable: true, latencyMs, ids: parseModelIds(json) };
  } catch (e) {
    return {
      reachable: false,
      latencyMs: Math.round(performance.now() - started),
      ids: new Set(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function probeProviders(
  runtime: ModelRuntime,
  options: ProbeOptions = {},
): Promise<ProviderProbe[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wanted = options.providers ? new Set(options.providers) : undefined;
  const providers = runtime.getProviders().filter((p) => {
    if (wanted) return wanted.has(p.id);
    return runtime.getProviderAuthStatus(p.id).configured;
  });

  const results = await Promise.all(
    providers.map(async (p): Promise<ProviderProbe> => {
      const catalog = runtime.getModels(p.id);
      const first = catalog[0];
      const baseUrl = p.baseUrl ?? first?.baseUrl;
      const api = first?.api;
      const configured = runtime.getProviderAuthStatus(p.id).configured;
      const probe: ProviderProbe = {
        provider: p.id,
        name: p.name,
        configured,
        reachable: false,
        models: [],
      };
      if (baseUrl) probe.baseUrl = baseUrl;
      if (api) probe.api = api;

      let apiKey: string | undefined;
      let authHeaders: Record<string, string> = {};
      let effectiveBase = baseUrl;
      if (configured) {
        try {
          const auth = await runtime.getAuth(p.id);
          apiKey = auth?.auth.apiKey;
          if (auth?.auth.headers) {
            authHeaders = Object.fromEntries(
              Object.entries(auth.auth.headers).filter(
                (kv): kv is [string, string] => typeof kv[1] === "string",
              ),
            );
          }
          if (auth?.auth.baseUrl) effectiveBase = auth.auth.baseUrl;
        } catch (e) {
          probe.error = `凭据解析失败：${e instanceof Error ? e.message : String(e)}`;
        }
      }

      let listing: EndpointListing | undefined;
      if (effectiveBase && api) {
        const req = buildModelsRequest(api, effectiveBase, apiKey, authHeaders);
        if (req) listing = await listEndpointModels(req.url, req.headers, timeoutMs);
      }
      if (listing) {
        probe.reachable = listing.reachable;
        probe.latencyMs = listing.latencyMs;
        if (listing.error) probe.error = listing.error;
        if (listing.status !== undefined && isAuthFailureStatus(listing.status)) {
          probe.authFailed = true;
        }
      }
      const endpointIds = listing?.ids ?? new Set<string>();

      const models: ProbedModel[] = catalog.map((m) => ({
        ...toModelInfo(m),
        listedByEndpoint: endpointIds.has(m.id),
        catalogKnown: true,
      }));
      const known = new Set(catalog.map((m) => m.id));
      for (const id of endpointIds) {
        if (known.has(id)) continue;
        models.push({
          provider: p.id,
          id,
          name: id,
          api: api ?? "unknown",
          baseUrl: effectiveBase ?? "",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 0,
          maxTokens: 0,
          listedByEndpoint: true,
          catalogKnown: false,
        });
      }
      probe.models = models;
      return probe;
    }),
  );
  return results;
}
