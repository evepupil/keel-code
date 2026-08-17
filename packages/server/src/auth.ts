import type { MiddlewareHandler } from "hono";

/** 本地令牌：请求头 x-keel-token 或查询参数 token。 */
export function tokenAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const provided = c.req.header("x-keel-token") ?? c.req.query("token");
    if (provided !== token) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
