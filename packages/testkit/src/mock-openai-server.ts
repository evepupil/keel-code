/**
 * 极简 OpenAI 兼容 mock 服务：按脚本回放文本 / 工具调用，供引擎与闭环测试不依赖真模型。
 * 只实现 GET /v1/models 与 POST /v1/chat/completions（流式）。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface ScriptedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
}

export interface ScriptedTurn {
  /** 回复正文（可为空） */
  text?: string;
  /** 本轮发起的工具调用 */
  toolCalls?: ScriptedToolCall[];
  /** 返回 HTTP 错误（模拟限流 / 故障） */
  httpError?: { status: number; message: string };
}

export interface RecordedRequest {
  model: string;
  messages: unknown[];
  tools: unknown[] | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

export interface MockOpenAIServer {
  readonly baseUrl: string;
  readonly port: number;
  readonly requests: RecordedRequest[];
  /** 追加脚本轮次；每个 chat/completions 请求消费一轮，脚本用尽时回一句默认文本 */
  enqueue(...turns: ScriptedTurn[]): void;
  /** 每个 completions 请求前调用，可用来按请求内容动态生成脚本 */
  onRequest(handler: (req: RecordedRequest) => ScriptedTurn | undefined): void;
  close(): Promise<void>;
}

export interface MockOpenAIServerOptions {
  models?: string[];
  defaultText?: string;
}

export async function startMockOpenAIServer(
  options: MockOpenAIServerOptions = {},
): Promise<MockOpenAIServer> {
  const models = options.models ?? ["mock-1"];
  const defaultText = options.defaultText ?? "（mock 默认回复）";
  const queue: ScriptedTurn[] = [];
  const requests: RecordedRequest[] = [];
  let dynamic: ((req: RecordedRequest) => ScriptedTurn | undefined) | undefined;

  const server: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url.replace(/\?.*$/, "").endsWith("/models")) {
      json(res, 200, { object: "list", data: models.map((id) => ({ id, object: "model" })) });
      return;
    }
    if (req.method === "POST" && url.endsWith("/chat/completions")) {
      readBody(req)
        .then((raw) => {
          const body = JSON.parse(raw) as Record<string, unknown>;
          const recorded: RecordedRequest = {
            model: String(body.model ?? ""),
            messages: Array.isArray(body.messages) ? body.messages : [],
            tools: Array.isArray(body.tools) ? body.tools : undefined,
            headers: req.headers,
            body,
          };
          requests.push(recorded);
          const turn = dynamic?.(recorded) ?? queue.shift() ?? { text: defaultText };
          if (turn.httpError) {
            json(res, turn.httpError.status, {
              error: { message: turn.httpError.message, type: "mock_error" },
            });
            return;
          }
          streamTurn(res, recorded.model || "mock-1", turn);
        })
        .catch((e: unknown) => {
          json(res, 400, { error: { message: String(e) } });
        });
      return;
    }
    json(res, 404, { error: { message: `mock: unknown route ${req.method} ${url}` } });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    port,
    requests,
    enqueue: (...turns) => {
      queue.push(...turns);
    },
    onRequest: (handler) => {
      dynamic = handler;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections?.();
      }),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

function streamTurn(res: ServerResponse, model: string, turn: ScriptedTurn): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const id = `chatcmpl-mock-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) => {
    res.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`,
    );
  };
  chunk({ role: "assistant", content: "" });
  if (turn.text) {
    // 拆成几段模拟流式
    const pieces = turn.text.match(/.{1,12}/gsu) ?? [turn.text];
    for (const piece of pieces) chunk({ content: piece });
  }
  const calls = turn.toolCalls ?? [];
  calls.forEach((call, index) => {
    const callId = call.id ?? `call_${index}_${Math.random().toString(36).slice(2, 8)}`;
    chunk({
      tool_calls: [
        {
          index,
          id: callId,
          type: "function",
          function: { name: call.name, arguments: "" },
        },
      ],
    });
    chunk({
      tool_calls: [{ index, function: { arguments: JSON.stringify(call.arguments) } }],
    });
  });
  const finish = calls.length > 0 ? "tool_calls" : "stop";
  chunk({}, finish);
  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();
}
