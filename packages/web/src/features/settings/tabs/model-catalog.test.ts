import { describe, expect, it } from "vitest";
import { syncRemoteModels } from "./model-catalog";

describe("syncRemoteModels", () => {
  it("removes stale unchecked entries and keeps selected entries", () => {
    const result = syncRemoteModels(
      [
        { id: "claude-fable-old", enabled: false },
        { id: "manual-model", enabled: true, name: "Manual" },
        { id: "still-listed", enabled: false, name: "Existing" },
      ],
      [{ id: "still-listed" }, { id: "new-model" }],
    );

    expect(result.models).toEqual([
      { id: "manual-model", enabled: true, name: "Manual" },
      { id: "still-listed", enabled: false, name: "Existing" },
      { id: "new-model", name: "new-model", enabled: false },
    ]);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
  });

  it("deduplicates remote IDs and preserves existing model metadata", () => {
    const result = syncRemoteModels(
      [{ id: "kept", name: "Readable name", enabled: true }],
      [{ id: "kept" }, { id: "new" }, { id: "new" }, { id: "" }],
    );

    expect(result.models).toEqual([
      { id: "kept", name: "Readable name", enabled: true },
      { id: "new", name: "new", enabled: false },
    ]);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
  });
});
