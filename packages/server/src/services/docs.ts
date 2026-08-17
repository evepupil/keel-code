/** 装配设计确认工具（keel_design_confirm / keel_doc_changes / keel_design_freeze）。 */

import { registerDocTools } from "@keel-code/docs";
import type { Engine } from "@keel-code/engine";
import type { SessionHub } from "../hub.js";

export function setupDocs(engine: Engine, hub: SessionHub): { dispose(): void } {
  const off = registerDocTools({ engine, getSession: (id) => hub.get(id) });
  return { dispose: off };
}
