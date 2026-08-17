import type {
  ApprovalRequest,
  BoardData,
  CreateSessionInput,
  DocListItem,
  DocRead,
  KeelSettings,
  ModelInfo,
  PickFolderResult,
  ProjectInfo,
  ProviderInfo,
  ProviderProbe,
  RosterEntry,
  SessionDetail,
  SessionListItem,
  SessionMeta,
  TiersOverview,
  WorkspaceInfo,
} from "./types";

const TOKEN_KEY = "keel.token";

/** 首次从 URL ?token= 取令牌存入 sessionStorage，再把它从地址栏抹掉。 */
export function bootstrapToken(): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
    return fromUrl;
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-keel-token": getToken(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // 非 JSON 错误体
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

let currentWorkspaceId: string | null = null;

/** 之后所有工作区级请求都打到 /api/w/<wid>/… */
export function setApiWorkspace(id: string | null): void {
  currentWorkspaceId = id;
}
export function getApiWorkspace(): string | null {
  return currentWorkspaceId;
}

/** 工作区级路径 */
function w(path: string): string {
  if (!currentWorkspaceId) throw new ApiError(0, "没有选中工作区");
  return `/w/${currentWorkspaceId}${path}`;
}

export const api = {
  // ---- 全局 ----
  health: () => request<{ ok: boolean; version: string }>("/health"),
  workspaces: () => request<WorkspaceInfo[]>("/workspaces"),
  addWorkspace: (path: string, name?: string) =>
    request<WorkspaceInfo>("/workspaces", {
      method: "POST",
      body: JSON.stringify(name ? { path, name } : { path }),
    }),
  removeWorkspace: (id: string) =>
    request<{ ok: true }>(`/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" }),
  pickFolder: () => request<PickFolderResult>("/workspaces/pick", { method: "POST" }),
  // ---- 工作区级 ----
  project: () => request<ProjectInfo>(w("/project")),
  providers: () => request<ProviderInfo[]>("/providers"),
  probe: (providers?: string[]) =>
    request<ProviderProbe[]>(
      `/providers/probe${providers ? `?providers=${providers.join(",")}` : ""}`,
    ),
  setKey: (provider: string, apiKey: string) =>
    request<{ ok: true }>(`/providers/${encodeURIComponent(provider)}/key`, {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),
  removeKey: (provider: string) =>
    request<{ ok: true }>(`/providers/${encodeURIComponent(provider)}/key`, { method: "DELETE" }),
  models: (available = true) => request<ModelInfo[]>(`/models${available ? "?available=1" : ""}`),
  modelTiers: () => request<TiersOverview>("/models/tiers"),
  sessions: (ensureMain = false) =>
    request<SessionListItem[]>(w(`/sessions${ensureMain ? "?ensureMain=1" : ""}`)),
  createSession: (input: CreateSessionInput) =>
    request<{ meta: SessionMeta }>(w("/sessions"), { method: "POST", body: JSON.stringify(input) }),
  session: (id: string) => request<SessionDetail>(w(`/sessions/${id}`)),
  prompt: (id: string, text: string, deliverAs?: "steer" | "followUp") =>
    request<{ ok: true }>(w(`/sessions/${id}/prompt`), {
      method: "POST",
      body: JSON.stringify(deliverAs ? { text, deliverAs } : { text }),
    }),
  abort: (id: string) => request<{ ok: true }>(w(`/sessions/${id}/abort`), { method: "POST" }),
  docs: (dir = "docs") => request<DocListItem[]>(w(`/docs?dir=${encodeURIComponent(dir)}`)),
  readDoc: (path: string, diff = false) =>
    request<DocRead>(w(`/docs/read?path=${encodeURIComponent(path)}${diff ? "&diff=1" : ""}`)),
  writeDoc: (path: string, content: string) =>
    request<{ ok: true }>(w("/docs/write"), {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  annotateDoc: (path: string, line: number, text: string) =>
    request<{ ok: true; content: string }>(w("/docs/annotate"), {
      method: "POST",
      body: JSON.stringify({ path, line, text }),
    }),
  board: () => request<BoardData>(w("/board")),
  resolveDecision: (line: number) =>
    request<{ ok: true }>(w("/decisions/resolve"), {
      method: "POST",
      body: JSON.stringify({ line }),
    }),
  mcp: () =>
    request<{ name: string; connected: boolean; tools: string[]; error?: string }[]>(w("/mcp")),
  approvals: () => request<ApprovalRequest[]>(w("/approvals")),
  resolveApproval: (id: string, decision: "allow" | "deny" | "allow-session") =>
    request<{ ok: true }>(w(`/approvals/${id}`), {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  roster: () => request<RosterEntry[]>(w("/roster")),
  rosterEntry: (id: string) => request<RosterEntry>(w(`/roster/${id}`)),
  settings: () => request<KeelSettings>("/settings"),
  patchSettings: (patch: Partial<KeelSettings>) =>
    request<KeelSettings>("/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  patchSession: (
    id: string,
    patch: {
      title?: string;
      model?: { provider: string; id: string };
      thinkingLevel?: string;
      archived?: boolean;
    },
  ) =>
    request<{ meta: SessionMeta }>(w(`/sessions/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};
