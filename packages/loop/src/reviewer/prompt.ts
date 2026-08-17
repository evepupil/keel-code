import { Type } from "@keel-code/engine";

/** reviewer 必须通过 submit_result 提交的结论结构。 */
export const REVIEW_SCHEMA = Type.Object({
  verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")], { description: "总体结论" }),
  summary: Type.Optional(Type.String({ description: "一句话结论" })),
  findings: Type.Array(
    Type.Object({
      issue: Type.String({ description: "问题描述（具体、带证据：文件、行、现象）" }),
      category: Type.Union([Type.Literal("deterministic"), Type.Literal("decision")], {
        description:
          "deterministic=答案明确的工程问题；decision=需要用户拍板的产品 / 需求问题；分不清归 decision",
      }),
      file: Type.Optional(Type.String({ description: "涉及文件" })),
      suggestion: Type.Optional(Type.String({ description: "修复建议（deterministic 必填）" })),
    }),
    { description: "需要动作的问题；确认无误的内容不要放这里" },
  ),
});

export interface ReviewerPromptInput {
  cwd: string;
  batch: string;
  scope?: string;
  designDoc?: string;
  round: number;
  /** 上一轮未修完的问题（复验用） */
  previousFindings?: string;
}

export function reviewerPrompt(input: ReviewerPromptInput): string {
  return [
    "你是 keel 的独立 reviewer，以干净上下文复核一个刚完成的实现批次。你是只读角色：只阅读和检查，禁止修改文件、禁止 git 写操作。",
    "",
    `工作目录：${input.cwd}`,
    `批次描述：${input.batch}`,
    `批次范围：${input.scope ?? "未声明（按 git 工作树未提交改动 + 批次描述判断，先 git status / git diff 看改了什么）"}`,
    input.designDoc
      ? `设计文档（对照逐项）：${input.designDoc}`
      : "（本批无设计文档，按通用规范复核）",
    `这是第 ${input.round} 轮${input.round > 1 ? "（复验：重点确认上一轮问题是否修好，同时看有没有改出新问题）" : ""}。`,
    input.previousFindings ? `上一轮未通过的问题：\n${input.previousFindings}` : "",
    "",
    "复核清单：",
    "1. 对照设计文档（如有）：职责边界、结构、关键决策是否落实。",
    "2. 确定性工程问题：类型 / 语法错误、空值与边界、明显 bug、需求明确但实现不符、缺少必要测试。",
    "3. keel 规范：按职责拆文件、单一数据源；前端硬规则——颜色 / 字号 / 间距 / 圆角 / 阴影必须取自 token（散落硬编码色值是典型违规）、禁 emoji 图标、禁渐变、禁空话文案。",
    "4. 产品 / 需求问题：需求歧义、实现暴露出新的产品选择、会改变业务行为或验收标准、多方案取舍——归 decision；分不清的也归 decision。",
    "",
    "判定纪律：只报有证据、且需要动作的问题；确认无误的内容写进 summary，不要作为 finding。deterministic 必须给可执行的修复建议。verdict=pass 时 findings 必须为空。全部通过才给 pass。",
    "检查完成后必须调用 submit_result 提交结论，然后停止。",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
