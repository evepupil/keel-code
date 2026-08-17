import type { CatalogModel } from "../../../api/types";

interface RemoteModel {
  id: string;
}

export interface ModelCatalogSync {
  models: CatalogModel[];
  added: number;
  removed: number;
}

/**
 * Synchronize fetched model IDs while keeping explicitly enabled catalog items.
 * Fetched entries are initially disabled, so stale unchecked entries can be
 * removed without deleting manually added or explicitly selected models.
 */
export function syncRemoteModels(
  existing: readonly CatalogModel[],
  remote: readonly RemoteModel[],
): ModelCatalogSync {
  const remoteIds = new Set(remote.map((model) => model.id).filter(Boolean));
  const models: CatalogModel[] = [];
  const seen = new Set<string>();
  let removed = 0;

  for (const model of existing) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    if (model.enabled !== false || remoteIds.has(model.id)) {
      models.push(model);
    } else {
      removed += 1;
    }
  }

  let added = 0;
  for (const model of remote) {
    if (!model.id || seen.has(model.id)) continue;
    models.push({ id: model.id, name: model.id, enabled: false });
    seen.add(model.id);
    added += 1;
  }

  return { models, added, removed };
}
