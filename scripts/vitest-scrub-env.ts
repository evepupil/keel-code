/**
 * vitest 全局 setup：剥掉宿主环境的模型 provider 变量。
 * 测试全部走 @keel-code/testkit 的 mock 端点；宿主里若带着真实端点配置
 * （例如从 Claude Code / Codex 会话里跑 pnpm gate，环境里有 ANTHROPIC_BASE_URL），
 * pi 会把对应 provider 当作已配置，引擎默认模型与选档都会被带偏，mock 断言失效。
 */
for (const key of Object.keys(process.env)) {
  if (/^(ANTHROPIC|OPENAI|DEEPSEEK|GEMINI|GOOGLE|MOONSHOT|ZHIPU|AZURE_OPENAI)_/.test(key)) {
    delete process.env[key];
  }
}
