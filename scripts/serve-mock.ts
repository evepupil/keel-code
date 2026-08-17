/**
 * 本地演示 / 目验用：起一个 mock 模型服务 + keel 服务（带已构建的 Web 工作台），不需要真 key。
 * 用法：pnpm tsx scripts/serve-mock.ts [port]
 *
 * mock 会按用户消息里的关键词演戏：
 * - 「写文件」→ 调 write 写 hello.txt
 * - 「设计」  → 调 keel_design_confirm 请求你批注 docs/模块设计/登录.md
 * - 「读改动」/「批注」→ 调 keel_doc_changes 读你的批注并回显
 * - 「冻结」  → 调 keel_design_freeze
 * - 「上报」  → 调 keel_batch_report 走一遍 review（reviewer 也是 mock，第一次 fail 第二次 pass）
 */
import { resolve } from "node:path";
import { startServer } from "@keel-code/server";
import { makeTempKeelHome, makeTempProject, startMockOpenAIServer } from "@keel-code/testkit";

const port = Number(process.argv[2] ?? 3131);
const mock = await startMockOpenAIServer({ models: ["mock-1", "mock-cheap"], defaultText: "" });

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? (content as { type?: string; text?: string }[])
          .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
          .join("")
      : "";

let reviewRounds = 0;
mock.onRequest((req) => {
  const sys = textOf((req.messages[0] as { content?: unknown })?.content);
  const last = req.messages.at(-1) as { role?: string; content?: unknown } | undefined;
  const lastUser = [...req.messages]
    .reverse()
    .find((m) => (m as { role?: string }).role === "user") as { content?: unknown } | undefined;
  const text = textOf(lastUser?.content);
  const isReviewer = sys.includes("你是一次性子 agent") && text.includes("独立 reviewer");
  if (!isReviewer && text.includes("列任务")) {
    if (last?.role === "tool") return { text: "清单已列好，我按这个顺序做。" };
    return {
      toolCalls: [
        {
          name: "keel_tasks_update",
          arguments: {
            tasks: [
              { text: "梳理任务面板数据来源", status: "done" },
              { text: "实现 keel_tasks_update 工具", status: "done" },
              { text: "方法论加任务清单规则", status: "doing" },
              { text: "补单测并提交", status: "todo" },
            ],
          },
        },
      ],
    };
  }
  if (isReviewer) {
    if (last?.role === "tool") return { text: "结论已提交。" };
    reviewRounds += 1;
    return {
      toolCalls: [
        {
          name: "submit_result",
          arguments:
            reviewRounds % 2 === 1
              ? {
                  verdict: "fail",
                  summary: "有一处颜色硬编码",
                  findings: [
                    {
                      issue: "hello.txt 里写死了 #ff0000",
                      category: "deterministic",
                      file: "hello.txt",
                      suggestion: "改成从 token 取",
                    },
                  ],
                }
              : { verdict: "pass", summary: "问题已修，结构清晰", findings: [] },
        },
      ],
    };
  }
  if (last?.role === "tool") {
    const toolText = textOf(last.content);
    if (toolText.includes("批注块")) {
      return {
        text: `我读到了你的改动：\n\n${toolText.slice(0, 600)}\n\n我的理解逐条如下（请确认）：\n1. 你改的是「登录方式」这一段，我理解为要增加手机号登录，对吗？\n\n确认后我会修订文档并冻结。`,
      };
    }
    if (toolText.includes("review 未通过")) {
      return {
        toolCalls: [{ name: "write", arguments: { path: "hello.txt", content: "color: token\n" } }],
      };
    }
    if (toolText.includes("Successfully wrote") && reviewRounds % 2 === 1) {
      return {
        toolCalls: [
          {
            name: "keel_batch_report",
            arguments: { batch: "hello 模块（修复后）", scope: "hello.txt" },
          },
        ],
      };
    }
    return { text: `工具跑完了：\n\n${toolText.slice(0, 400)}` };
  }
  if (/写文件|write/i.test(text)) {
    return {
      toolCalls: [{ name: "write", arguments: { path: "hello.txt", content: "color: #ff0000\n" } }],
    };
  }
  if (/读改动|批注/.test(text)) {
    return {
      toolCalls: [{ name: "keel_doc_changes", arguments: { path: "docs/模块设计/登录.md" } }],
    };
  }
  if (/冻结/.test(text)) {
    return {
      toolCalls: [
        {
          name: "keel_design_freeze",
          arguments: { path: "docs/模块设计/登录.md", note: "按批注修订后确认" },
        },
      ],
    };
  }
  if (/上报|review/i.test(text)) {
    return {
      toolCalls: [
        { name: "keel_batch_report", arguments: { batch: "hello 模块", scope: "hello.txt" } },
      ],
    };
  }
  if (/设计/.test(text)) {
    return {
      toolCalls: [
        {
          name: "keel_design_confirm",
          arguments: {
            path: "docs/模块设计/登录.md",
            summary: "登录模块设计：重点看「登录方式」与「错误处理」两节",
          },
        },
      ],
    };
  }
  return {
    text: `收到：「${text.slice(0, 40)}」\n\n这是 **mock** 模型的回复，用来目验界面。\n\n- 支持 markdown\n- \`代码\` 也行\n\n\`\`\`ts\nconst x = 1;\n\`\`\``,
  };
});

const home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1", "mock-cheap"] });
const project = makeTempProject({
  git: true,
  files: {
    "README.md": "# demo project\n",
    "src/styles/tokens.ts": "export const t = 1;\n",
    "docs/roadmap.md": [
      "# demo Roadmap",
      "",
      "## 目标",
      "",
      "演示 keel 工作台。",
      "",
      "## 里程碑",
      "",
      "| 里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准 |",
      "|---|---|---|---|---|---|",
      "| M0 | 初始化 | 已完成 | 无 | [登录](模块设计/登录.md) | 骨架跑通 |",
      "| M1 | 登录模块 | 进行中 | M0 | [登录](模块设计/登录.md) | 登录页可用 |",
      "",
    ].join("\n"),
    "docs/模块设计/登录.md": [
      "# 登录模块",
      "",
      "- **模块定位**：用户登录。",
      "- **所属里程碑**：[M1](../roadmap.md#m1)",
      "",
      "## 登录方式",
      "",
      "支持邮箱 + 密码登录。",
      "",
      "## 错误处理",
      "",
      "密码错误提示「邮箱或密码不正确」，连续 5 次锁定 10 分钟。",
      "",
    ].join("\n"),
  },
});
const server = await startServer({
  cwd: project.path,
  homeDir: home.path,
  port,
  staticDir: resolve(import.meta.dirname, "..", "packages", "web", "dist"),
  version: "dev-mock",
});
console.log(`mock 模型：${mock.baseUrl}`);
console.log(`临时项目：${project.path}`);
console.log(`工作台：${server.url}`);
const shutdown = async () => {
  await server.close();
  await mock.close();
  home.cleanup();
  project.cleanup();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
