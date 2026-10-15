import { describe, expect, test } from "bun:test";
import { type } from "arktype";
import { XrpcRouter } from "./router.ts";
import type { AuthCtx } from "./types.ts";

const stubAuth = async (_req: Request): Promise<AuthCtx> => ({
  did: "did:plc:test",
});

function build(register: (r: XrpcRouter) => void): XrpcRouter {
  const r = new XrpcRouter(stubAuth);
  register(r);
  return r;
}

async function call(
  router: XrpcRouter,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const fakeServer = {
    requestIP: () => ({ address: "127.0.0.1", family: "IPv4", port: 12345 }),
  } as unknown as Parameters<typeof router.fetch>[1];
  const res = await router.fetch(new Request(url, init), fakeServer);
  if (!res) throw new Error("router returned no Response");
  return res;
}

describe("XrpcRouter schema validation", () => {
  describe("query", () => {
    const Params = type({ roomId: "string" });
    const Response = type({ messages: "string[]" });

    test("happy path returns 200 with validated body", async () => {
      const router = build((r) =>
        r.query("test.query", {
          paramsSchema: Params,
          outputSchema: Response,
          handler: async (params) => ({ messages: [`for-${params.roomId}`] }),
        }),
      );
      const res = await call(router, "http://x/xrpc/test.query?roomId=abc");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ messages: ["for-abc"] });
    });

    test("input rejection returns 400 with InvalidRequest", async () => {
      const router = build((r) =>
        r.query("test.query", {
          paramsSchema: Params,
          outputSchema: Response,
          handler: async () => ({ messages: [] }),
        }),
      );
      const res = await call(router, "http://x/xrpc/test.query"); // missing roomId
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("InvalidRequest");
      expect(body.message).toContain("test.query params");
    });

    test("output mismatch throws and surfaces as 500", async () => {
      const router = build((r) =>
        r.query("test.query", {
          paramsSchema: Params,
          outputSchema: Response,
          // Wrong shape on purpose.
          handler: async () => ({ wrong: "shape" }) as never,
        }),
      );
      const res = await call(router, "http://x/xrpc/test.query?roomId=abc");
      expect(res.status).toBe(500);
    });
  });

  describe("procedure", () => {
    const Input = type({ roomId: "string" });
    const Output = type({ ok: "boolean" });

    test("happy path", async () => {
      const router = build((r) =>
        r.procedure("test.proc", {
          inputSchema: Input,
          outputSchema: Output,
          handler: async (_p, _a, body: any) => ({
            ok: typeof body.roomId === "string",
          }),
        }),
      );
      const res = await call(router, "http://x/xrpc/test.proc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "r1" }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    test("input rejection returns 400", async () => {
      const router = build((r) =>
        r.procedure("test.proc", {
          inputSchema: Input,
          handler: async () => undefined,
        }),
      );
      const res = await call(router, "http://x/xrpc/test.proc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("InvalidRequest");
      expect(body.message).toContain("test.proc input");
    });

    test("output mismatch surfaces as 500", async () => {
      const router = build((r) =>
        r.procedure("test.proc", {
          inputSchema: Input,
          outputSchema: Output,
          handler: async () => ({ wrong: 1 }) as never,
        }),
      );
      const res = await call(router, "http://x/xrpc/test.proc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "r1" }),
      });
      expect(res.status).toBe(500);
    });

    test("void short-circuit (no outputSchema) returns empty 200", async () => {
      const router = build((r) =>
        r.procedure("test.proc", {
          inputSchema: Input,
          // No outputSchema — handler returns undefined.
          handler: async () => undefined,
        }),
      );
      const res = await call(router, "http://x/xrpc/test.proc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "r1" }),
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("");
    });
  });

  test("routes without schemas pass through unchanged", async () => {
    const router = build((r) =>
      r.query("legacy", {
        handler: async () => ({ anything: 123 }),
      }),
    );
    const res = await call(router, "http://x/xrpc/legacy?anything=goes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ anything: 123 });
  });
});


describe("XrpcRouter stream routes", () => {
  type StreamTestHandler = (
    req: Request,
    ctx: { params: Record<string, unknown>; authenticate: () => Promise<AuthCtx> },
  ) => Promise<Response>;

  function buildStream(
    handler: StreamTestHandler,
    verifier: (req: Request) => Promise<AuthCtx> = async () => ({ did: null }),
  ): XrpcRouter {
    const r = new XrpcRouter(verifier);
    r.stream("test.stream", { handler: handler as never });
    return r;
  }

  test("hands the handler the raw request and parsed params", async () => {
    let seen: { auth: string | null; params: Record<string, unknown> } | undefined;
    const router = buildStream(async (req, ctx) => {
      seen = { auth: req.headers.get("authorization"), params: ctx.params };
      return new Response("ok");
    });
    const res = await call(router, "http://x/xrpc/test.stream?topic=abc", {
      headers: { authorization: "Bearer token" },
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual({ auth: "Bearer token", params: { topic: "abc" } });
  });

  test("authenticate() runs the router's verifier on the same request", async () => {
    let verifiedAuthorization: string | null = null;
    let resolved: AuthCtx | undefined;
    const router = buildStream(
      async (_req, ctx) => {
        resolved = await ctx.authenticate();
        return new Response("ok");
      },
      async (req) => {
        verifiedAuthorization = req.headers.get("authorization");
        return { did: "did:plc:alice" };
      },
    );
    await call(router, "http://x/xrpc/test.stream", {
      headers: { authorization: "Bearer token" },
    });
    expect(verifiedAuthorization).toBe("Bearer token");
    expect(resolved).toEqual({ did: "did:plc:alice" });
  });

  test("does not authenticate unless the handler asks, so it can refuse first", async () => {
    let verifierCalls = 0;
    const router = buildStream(
      async () => new Response(null, { status: 503 }),
      async () => {
        verifierCalls += 1;
        return { did: null };
      },
    );
    const res = await call(router, "http://x/xrpc/test.stream");
    expect(res.status).toBe(503);
    expect(verifierCalls).toBe(0);
  });

  test("requires GET", async () => {
    const router = buildStream(async () => new Response("ok"));
    const res = await call(router, "http://x/xrpc/test.stream", { method: "POST" });
    expect(res.status).toBe(405);
  });

  test("passes the handler's streaming response through untouched", async () => {
    const router = buildStream(
      async () =>
        new Response("event: ready\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const res = await call(router, "http://x/xrpc/test.stream");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe("event: ready\n\n");
  });

  test("maps an XrpcError thrown by the handler like any other route", async () => {
    const { XrpcError } = await import("./errors.ts");
    const router = buildStream(async () => {
      throw new XrpcError(418, "Teapot", "short and stout");
    });
    const res = await call(router, "http://x/xrpc/test.stream");
    expect(res.status).toBe(418);
    expect(((await res.json()) as { error: string }).error).toBe("Teapot");
  });
});
