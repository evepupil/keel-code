/**
 * 从 Claude Code / Codex 会话里起 keel 时，宿主环境带着 ANTHROPIC_BASE_URL 等，
 * 会把请求拐到本机代理，也会把没加过的内置提供方标成「已配置」。启动时剥掉。
 */
export const INHERITED_PROVIDER_ENV =
  /^(ANTHROPIC|OPENAI|DEEPSEEK|GEMINI|GOOGLE|MOONSHOT|ZHIPU|AZURE_OPENAI)_/;

export function scrubInheritedProviderEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = [];
  for (const key of Object.keys(env)) {
    if (INHERITED_PROVIDER_ENV.test(key)) {
      delete env[key];
      removed.push(key);
    }
  }
  return removed;
}
