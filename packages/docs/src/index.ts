/**
 * @keel-code/docs
 *
 * 文档管理：设计文档的批注块 / 冻结标记 / 改动读取工具、安全文件读写、roadmap 解析（看板数据）。
 */
export const PACKAGE_NAME = "@keel-code/docs" as const;
export {
  ANNOTATION_TAG,
  type AnnotationBlock,
  insertAnnotationAfterLine,
  parseAnnotations,
  renderAnnotation,
  stripAnnotations,
} from "./annotations/blocks.js";
export { fileDiff, shortHead } from "./files/git-diff.js";
export {
  type DocFile,
  isWritableDocPath,
  listDocs,
  readDoc,
  resolveInside,
  writeDoc,
} from "./files/safe-path.js";
export {
  applyFreeze,
  FREEZE_RE,
  type FreezeInfo,
  readFreeze,
  renderFreezeLine,
} from "./freeze/marker.js";
export {
  extractLinks,
  type Milestone,
  parseRoadmap,
  type Roadmap,
  type RoadmapLink,
} from "./roadmap/parse.js";
export {
  DESIGN_CONFIRM_ENTRY,
  DESIGN_FREEZE_ENTRY,
  type DesignConfirmData,
  type RegisterDocToolsDeps,
  registerDocTools,
} from "./tools/register.js";
