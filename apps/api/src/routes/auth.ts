import type { FastifyInstance } from "fastify";

export interface AuthHandler {
  handler(request: Request): Promise<Response>;
}

export async function registerAuthRoutes(
  server: FastifyInstance,
  auth: AuthHandler,
  authBaseUrl: string,
): Promise<void> {
  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    schema: { hide: true },
    async handler(request, reply) {
      try {
        const url = new URL(request.url, authBaseUrl);
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value))
            value.forEach((entry) => headers.append(key, entry));
          else headers.set(key, value);
        }
        const webRequest = new Request(url, {
          method: request.method,
          headers,
          ...(request.body === undefined
            ? {}
            : { body: JSON.stringify(request.body) }),
        });
        const response = await auth.handler(webRequest);
        reply.code(response.status);
        const cookies = response.headers.getSetCookie();
        response.headers.forEach((value, key) => {
          if (key !== "set-cookie") reply.header(key, value);
        });
        if (cookies.length) reply.header("set-cookie", cookies);
        return reply.send(response.body ? await response.text() : null);
      } catch {
        return reply.code(500).type("application/problem+json").send({
          type: "about:blank",
          title: "Authentication unavailable",
          status: 500,
          detail: "The authentication request could not be completed.",
          instance: request.id,
          traceId: request.id,
        });
      }
    },
  });
}
