import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { KeelHomePaths, ModelInfo, ModelRef, ProviderInfo } from "../types.js";
import { readModelsFile, visibleModelsOf } from "./catalog.js";

export async function createModelRuntime(
  paths: KeelHomePaths,
  options: { allowModelNetwork?: boolean } = {},
): Promise<ModelRuntime> {
  return ModelRuntime.create({
    authPath: paths.authFile,
    modelsPath: paths.modelsFile,
    allowModelNetwork: options.allowModelNetwork ?? false,
  });
}

export function toModelInfo(m: Model<Api>): ModelInfo {
  return {
    provider: m.provider,
    id: m.id,
    name: m.name,
    api: m.api,
    baseUrl: m.baseUrl,
    reasoning: m.reasoning,
    input: [...m.input],
    cost: {
      input: m.cost.input,
      output: m.cost.output,
      cacheRead: m.cost.cacheRead,
      cacheWrite: m.cost.cacheWrite,
    },
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  };
}

export function listProviders(runtime: ModelRuntime): ProviderInfo[] {
  return runtime.getProviders().map((p) => {
    const status = runtime.getProviderAuthStatus(p.id);
    const info: ProviderInfo = {
      id: p.id,
      name: p.name,
      configured: status.configured,
      modelCount: runtime.getModels(p.id).length,
      kind: runtime.getRegisteredNativeProvider(p.id) ? "builtin" : "custom",
      added: false,
    };
    if (p.baseUrl) info.baseUrl = p.baseUrl;
    if (status.label) info.authSource = status.label;
    return info;
  });
}

export function listModels(
  runtime: ModelRuntime,
  modelsPath: string,
  providerId?: string,
): ModelInfo[] {
  return visibleModelsOf(
    runtime.getModels(providerId).map(toModelInfo),
    readModelsFile(modelsPath),
  );
}

export function getModel(
  runtime: ModelRuntime,
  modelsPath: string,
  ref: ModelRef,
): Model<Api> | undefined {
  const allowed = readModelsFile(modelsPath).providers[ref.provider]?.models;
  if (!allowed?.some((m) => m.id === ref.id && m.enabled !== false)) return undefined;
  return runtime.getModel(ref.provider, ref.id);
}

export async function availableModels(
  runtime: ModelRuntime,
  modelsPath: string,
): Promise<ModelInfo[]> {
  const models = await runtime.getAvailable();
  return visibleModelsOf(models.map(toModelInfo), readModelsFile(modelsPath));
}

/** 挑一个默认模型：用户目录里勾过、且已配置凭据的第一个。 */
export async function pickDefaultModel(
  runtime: ModelRuntime,
  modelsPath: string,
): Promise<Model<Api> | undefined> {
  const visible = await availableModels(runtime, modelsPath);
  const first = visible[0];
  if (!first) return undefined;
  return runtime.getModel(first.provider, first.id);
}
