/**
 * SSE transport: the per-user stream registry and outcome mapping.
 *
 * Driven against a fake connection so the assertions are about what the
 * transport decides, not about sockets. What matters here is isolation (a
 * stream only ever receives its own user's deliveries), the cap on streams per
 * account, and that an absent stream is `skipped` and never `gone`.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  _resetSseRegistry,
  closeAllSseConnections,
  frameSseEvent,
  liveSseStreamCount,
  liveSseSubscriptions,
  MAX_SSE_STREAMS_PER_USER,
  registerSseConnection,
  sseConnectionCount,
  unregisterSseConnection,
  type SseConnection,
  type SseWriteResult,
} from "./sse.ts";
import { PUSH_TRANSPORTS, type PushTarget } from "./types.ts";

const ALICE = "did:plc:alice";
const BOB = "did:plc:bob";
const BODY = JSON.stringify({ type: "message", roomName: "general" });

interface FakeConnection extends SseConnection {
  frames: string[];
  closedReasons: string[];
}

let nextId = 0;

function fakeConnection(
  userDid: string,
  result: SseWriteResult = "written",
): FakeConnection {
  nextId += 1;
  const frames: string[] = [];
  const closedReasons: string[] = [];
  return {
    id: `connection-${nextId}`,
    userDid,
    frames,
    closedReasons,
    send(frame) {
      if (result === "written") frames.push(frame);
      return result;
    },
    close(reason) {
      closedReasons.push(reason);
      unregisterSseConnection(this);
    },
  };
}

function targetFor(connection: SseConnection): PushTarget {
  return {
    kind: "sse",
    endpoint: connection.id,
    p256dh: "",
    auth: "",
    expirationTime: null,
  };
}

function transport() {
  const registered = PUSH_TRANSPORTS["sse"];
  if (registered === undefined) throw new Error("sse transport not registered");
  return registered;
}

afterEach(() => _resetSseRegistry());

describe("sse transport", () => {
  test("registers itself and reports configured", () => {
    expect(transport().kind).toBe("sse");
    expect(transport().isConfigured()).toBe(true);
  });

  test("writes a push event to the stream and reports delivered", async () => {
    const connection = fakeConnection(ALICE);
    registerSseConnection(connection);
    const outcome = await transport().deliver(targetFor(connection), BODY, {});
    expect(outcome).toEqual({ outcome: "delivered", status: null });
    expect(connection.frames).toEqual([`event: push\ndata: ${BODY}\n\n`]);
  });

  test("is skipped, not gone, once the stream has ended", async () => {
    const connection = fakeConnection(ALICE);
    registerSseConnection(connection);
    unregisterSseConnection(connection);
    const outcome = await transport().deliver(targetFor(connection), BODY, {});
    expect(outcome).toEqual({ outcome: "skipped", status: null });
  });

  test("a target naming an unknown connection is skipped", async () => {
    const outcome = await transport().deliver(
      { kind: "sse", endpoint: "no-such-connection", p256dh: "", auth: "", expirationTime: null },
      BODY,
      {},
    );
    expect(outcome).toEqual({ outcome: "skipped", status: null });
  });

  test.each<SseWriteResult>(["closed", "backlogged"])(
    "is skipped when the connection answers %s",
    async (result) => {
      const connection = fakeConnection(ALICE, result);
      registerSseConnection(connection);
      const outcome = await transport().deliver(targetFor(connection), BODY, {});
      expect(outcome).toEqual({ outcome: "skipped", status: null });
    },
  );

  test("refuses a body containing a line break instead of forging events", async () => {
    const connection = fakeConnection(ALICE);
    registerSseConnection(connection);
    const outcome = await transport().deliver(
      targetFor(connection),
      'x\n\nevent: push\ndata: {"forged":true}',
      {},
    );
    expect(outcome.outcome).toBe("retry");
    expect(connection.frames).toEqual([]);
  });
});

describe("frameSseEvent", () => {
  test("frames a single-line body", () => {
    expect(frameSseEvent("push", '{"a":1}')).toBe('event: push\ndata: {"a":1}\n\n');
  });

  test.each(["a\nb", "a\rb", "a\r\nb"])("rejects %j in the body", (body) => {
    expect(frameSseEvent("push", body)).toBeNull();
  });

  test("rejects a line break in the event name", () => {
    expect(frameSseEvent("push\ndata: x", "{}")).toBeNull();
  });
});

describe("stream registry", () => {
  test("liveSseSubscriptions lists only that user's streams, as row-shaped targets", () => {
    const alices = fakeConnection(ALICE);
    const bobs = fakeConnection(BOB);
    registerSseConnection(alices);
    registerSseConnection(bobs);
    expect(liveSseSubscriptions(ALICE)).toEqual([
      {
        userDid: ALICE,
        endpoint: alices.id,
        kind: "sse",
        p256dh: "",
        auth: "",
        expirationTime: null,
      },
    ]);
    expect(liveSseSubscriptions("did:plc:nobody")).toEqual([]);
  });

  test("a user's delivery never reaches another user's stream", async () => {
    const alices = fakeConnection(ALICE);
    const bobs = fakeConnection(BOB);
    registerSseConnection(alices);
    registerSseConnection(bobs);
    for (const row of liveSseSubscriptions(ALICE)) {
      await transport().deliver({ ...row, kind: "sse" }, BODY, {});
    }
    expect(alices.frames).toHaveLength(1);
    expect(bobs.frames).toEqual([]);
  });

  test("one user can hold several streams and each is a target", () => {
    registerSseConnection(fakeConnection(ALICE));
    registerSseConnection(fakeConnection(ALICE));
    expect(liveSseStreamCount(ALICE)).toBe(2);
    expect(liveSseSubscriptions(ALICE)).toHaveLength(2);
  });

  test("past the per-user cap the oldest stream is closed", () => {
    const streams = Array.from({ length: MAX_SSE_STREAMS_PER_USER }, () =>
      fakeConnection(ALICE),
    );
    for (const stream of streams) registerSseConnection(stream);
    const newest = fakeConnection(ALICE);
    registerSseConnection(newest);

    expect(streams[0]?.closedReasons).toEqual(["evicted-by-newer-stream"]);
    expect(streams.slice(1).every((s) => s.closedReasons.length === 0)).toBe(true);
    expect(liveSseStreamCount(ALICE)).toBe(MAX_SSE_STREAMS_PER_USER);
    expect(liveSseSubscriptions(ALICE).map((row) => row.endpoint)).toContain(newest.id);
  });

  test("the cap is per user", () => {
    for (let n = 0; n < MAX_SSE_STREAMS_PER_USER; n += 1) {
      registerSseConnection(fakeConnection(ALICE));
    }
    const bobs = fakeConnection(BOB);
    registerSseConnection(bobs);
    expect(bobs.closedReasons).toEqual([]);
    expect(liveSseStreamCount(BOB)).toBe(1);
  });

  test("eviction still holds when a connection's close does not unregister it", () => {
    const stubborn = fakeConnection(ALICE);
    stubborn.close = (reason) => {
      stubborn.closedReasons.push(reason);
    };
    registerSseConnection(stubborn);
    for (let n = 0; n < MAX_SSE_STREAMS_PER_USER; n += 1) {
      registerSseConnection(fakeConnection(ALICE));
    }
    expect(liveSseStreamCount(ALICE)).toBe(MAX_SSE_STREAMS_PER_USER);
    expect(sseConnectionCount()).toBe(MAX_SSE_STREAMS_PER_USER);
  });

  test("unregistering is by identity and drops an emptied user", () => {
    const only = fakeConnection(ALICE);
    registerSseConnection(only);
    unregisterSseConnection(fakeConnection(ALICE));
    expect(liveSseStreamCount(ALICE)).toBe(1);
    unregisterSseConnection(only);
    expect(liveSseStreamCount(ALICE)).toBe(0);
    expect(sseConnectionCount()).toBe(0);
  });

  test("closeAllSseConnections closes every stream", () => {
    const alices = fakeConnection(ALICE);
    const bobs = fakeConnection(BOB);
    registerSseConnection(alices);
    registerSseConnection(bobs);
    closeAllSseConnections("lease-lost");
    expect(alices.closedReasons).toEqual(["lease-lost"]);
    expect(bobs.closedReasons).toEqual(["lease-lost"]);
    expect(sseConnectionCount()).toBe(0);
  });
});
