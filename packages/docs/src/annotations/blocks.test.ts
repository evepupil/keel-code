import { describe, expect, it } from "vitest";
import {
  insertAnnotationAfterLine,
  parseAnnotations,
  renderAnnotation,
  stripAnnotations,
} from "./blocks.js";

const DOC = `# 登录模块

## 职责与边界

支持邮箱密码登录。

## 结构

- 页面
`;

describe("批注块", () => {
  it("插入 → 解析 → 清理 往返", () => {
    const at = new Date("2026-08-17T04:00:00Z");
    const withNote = insertAnnotationAfterLine(DOC, 4, "还要支持手机号", at);
    expect(withNote).toContain("> [!批注] 2026-08-17 04:00\n> 还要支持手机号");
    const notes = parseAnnotations(withNote);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.text).toBe("还要支持手机号");
    expect(notes[0]?.anchor).toBe("支持邮箱密码登录。");
    const stripped = stripAnnotations(withNote);
    expect(stripped.removed).toBe(1);
    expect(stripped.text).toBe(DOC);
  });
  it("多行批注与文末插入", () => {
    const t = insertAnnotationAfterLine(DOC, -1, "第一行\n第二行");
    const notes = parseAnnotations(t);
    expect(notes[0]?.text).toBe("第一行\n第二行");
    expect(notes[0]?.anchor).toBe("- 页面");
  });
  it("renderAnnotation 每行都带引用符", () => {
    expect(renderAnnotation("a\nb", new Date("2026-01-01T00:00:00Z"))).toBe(
      "> [!批注] 2026-01-01 00:00\n> a\n> b\n",
    );
  });
});
