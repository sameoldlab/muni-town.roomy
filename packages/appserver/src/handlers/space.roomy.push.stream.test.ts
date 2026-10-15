/**
 * Stream route: who gets a stream, and in what order the refusals happen.
 *
 * Built through `createPushStreamHandler` with injected dependencies, so every
 * branch of the access decision runs without a lease or a DID resolver. The
 * stream registry is the real one: the property that matters most is that a
 * stream is registered under the DID the token authenticated, and nothing the
 * request itself says.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  createPushStreamHandler,
  type PushStreamDeps,
} from "./space.roomy.push.stream.ts";
import {
  _resetSseRegistry,
  liveSseStreamCount,
} from "../push/transports/sse.ts";
import type { AuthCtx } from "../xrpc/types.ts";

const ALICE = "did:plc:alice";
const VICTIM = "did:plc:victim";

const aborters: AbortController[] = [];

interface Harness {
  deps: PushStreamDeps;
  authenticateCalls: number;
}

function harness(overrides: Partial<PushStreamDeps> = {}): Harness {
  return {
    authenticateCalls: 0,
    deps: {
      holdsDispatcher: () => true,
      userStreamCount: () => 0,
      totalStreamCount: () => 0,
      limits: {
        maxStreams: 2,
        maxAgeMs: 60_000,
        tickMs: 60_000,
        maxQueuedFrames: 8,
      },
      ...overrides,
    },
  };
}

function call(
  h: Harness,
  auth: AuthCtx,
  url = "http://appserver/xrpc/space.roomy.push.stream",
): Promise<Response> {
  const aborter = new AbortController();
  aborters.push(aborter);
  const request = new Request(url, { signal: aborter.signal });
  return createPushStreamHandler(h.deps)(request, {
    params: {},
    authenticate: async () => {
      h.authenticateCalls += 1;
      return auth;
    },
  });
}

afterEach(() => {
  for (const aborter of aborters.splice(0)) aborter.abort();
  _resetSseRegistry();
});

describe("push stream route", () => {
  test("opens an event stream for an authenticated user", async () => {
    const response = await call(harness(), { did: ALICE });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(liveSseStreamCount(ALICE)).toBe(1);
  });

  test("registers the stream under the authenticated DID, not the request's", async () => {
    await call(
      harness(),
      { did: ALICE },
      `http://appserver/xrpc/space.roomy.push.stream?did=${VICTIM}&userDid=${VICTIM}`,
    );
    expect(liveSseStreamCount(ALICE)).toBe(1);
    expect(liveSseStreamCount(VICTIM)).toBe(0);
  });

  test("refuses with 503 and Retry-After when this replica is not the dispatcher", async () => {
    const h = harness({ holdsDispatcher: () => false });
    const response = await call(h, { did: ALICE });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(((await response.json()) as { error: string }).error).toBe("NotDispatcher");
    expect(liveSseStreamCount(ALICE)).toBe(0);
  });

  test("checks the lease before paying to authenticate", async () => {
    const h = harness({ holdsDispatcher: () => false });
    await call(h, { did: ALICE });
    expect(h.authenticateCalls).toBe(0);
  });

  test("rejects an anonymous caller with 401 and opens nothing", async () => {
    const response = await call(harness(), { did: null });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("AuthRequired");
    expect(sseNoneOpen()).toBe(true);
  });

  test("a caller DID that is not a valid user DID is a 400, never a stream", async () => {
    await expect(call(harness(), { did: "not-a-did" })).rejects.toMatchObject({
      status: 400,
    });
    expect(liveSseStreamCount("not-a-did")).toBe(0);
  });

  test("refuses a new user with 503 when at capacity", async () => {
    const h = harness({ totalStreamCount: () => 2 });
    const response = await call(h, { did: ALICE });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(liveSseStreamCount(ALICE)).toBe(0);
  });

  test("a user who already has a stream is not turned away at capacity", async () => {
    const h = harness({ totalStreamCount: () => 2, userStreamCount: () => 1 });
    expect((await call(h, { did: ALICE })).status).toBe(200);
  });

  test("errors are never cacheable", async () => {
    const response = await call(harness(), { did: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

function sseNoneOpen(): boolean {
  return liveSseStreamCount(ALICE) === 0;
}
