import type {
  ApprovalRequest,
  BoardData,
  CreateSessionInput,
  DocListItem,
  DocRead,
  KeelSettings,
  ModelInfo,
  ProjectInfo,
  ProviderInfo,
  ProviderProbe,
  RosterEntry,
  SessionDetail,
  SessionListItem,
  SessionMeta,
  TiersOverview,
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

export const api = {
  project: () => request<ProjectInfo>("/project"),
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
    request<SessionListItem[]>(`/sessions${ensureMain ? "?ensureMain=1" : ""}`),
  createSession: (input: CreateSessionInput) =>
    request<{ meta: SessionMeta }>("/sessions", { method: "POST", body: JSON.stringify(input) }),
  session: (id: string) => request<SessionDetail>(`/sessions/${id}`),
  prompt: (id: string, text: string, deliverAs?: "steer" | "followUp") =>
    request<{ ok: true }>(`/sessions/${id}/prompt`, {
      method: "POST",
      body: JSON.stringify(deliverAs ? { text, deliverAs } : { text }),
    }),
  abort: (id: string) => request<{ ok: true }>(`/sessions/${id}/abort`, { method: "POST" }),
  docs: (dir = "docs") => request<DocListItem[]>(`/docs?dir=${encodeURIComponent(dir)}`),
  readDoc: (path: string, diff = false) =>
    request<DocRead>(`/docs/read?path=${encodeURIComponent(path)}${diff ? "&diff=1" : ""}`),
  writeDoc: (path: string, content: string) =>
    request<{ ok: true }>("/docs/write", {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  annotateDoc: (path: string, line: number, text: string) =>
    request<{ ok: true; content: string }>("/docs/annotate", {
      method: "POST",
      body: JSON.stringify({ path, line, text }),
    }),
  board: () => request<BoardData>("/board"),
  resolveDecision: (line: number) =>
    request<{ ok: true }>("/decisions/resolve", { method: "POST", body: JSON.stringify({ line }) }),
  mcp: () =>
    request<{ name: string; connected: boolean; tools: string[]; error?: string }[]>("/mcp"),
  approvals: () => request<ApprovalRequest[]>("/approvals"),
  resolveApproval: (id: string, decision: "allow" | "deny" | "allow-session") =>
    request<{ ok: true }>(`/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  roster: () => request<RosterEntry[]>("/roster"),
  rosterEntry: (id: string) => request<RosterEntry>(`/roster/${id}`),
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
    request<{ meta: SessionMeta }>(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};
