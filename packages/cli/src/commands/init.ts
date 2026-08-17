import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface InitResult {
  created: string[];
  skipped: string[];
}

const DEFAULT_CONFIG = {
  version: 1,
  guards: {
    frontend: true,
    lintOnWrite: true,
    commitGate: true,
  },
  acceptance: "milestone",
};

const AGENTS_README = `# 对话名册

由 keel 自动维护：每条对话一份 \`<名称>.md\`（导航信息 + 新鲜度），主对话据此路由。
名册只用于导航；需求 / 设计文档、review 记录、代码仓库才是事实。
`;

const ROADMAP_TEMPLATE = `# Roadmap

记录项目目标、里程碑、依赖、状态与退出标准。细节进模块设计文档，这里只留一句话进度和文档入口。

## 目标

（一句话说明这个项目要做什么）

## 里程碑

| 里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准 |
|---|---|---|---|---|---|
| M0 | 项目初始化 | 未开始 | 无 | 待建 | 骨架 + 门禁跑通 |
`;

/**
 * 在项目目录初始化 keel：.keel/config.json、.keel/agents/、docs/ 骨架。
 * 只创建缺失的文件，不覆盖已有内容。
 */
export function initProject(cwd: string): InitResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const ensureDir = (rel: string) => {
    const abs = join(cwd, rel);
    if (existsSync(abs)) {
      skipped.push(`${rel}/`);
      return;
    }
    mkdirSync(abs, { recursive: true });
    created.push(`${rel}/`);
  };
  const ensureFile = (rel: string, content: string) => {
    const abs = join(cwd, rel);
    if (existsSync(abs)) {
      skipped.push(rel);
      return;
    }
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
    created.push(rel);
  };

  ensureDir(".keel");
  ensureFile(".keel/config.json", `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  ensureDir(".keel/agents");
  ensureFile(".keel/agents/README.md", AGENTS_README);
  ensureDir("docs");
  ensureFile("docs/roadmap.md", ROADMAP_TEMPLATE);
  ensureDir("docs/模块设计");
  ensureDir("docs/review");
  return { created, skipped };
}
