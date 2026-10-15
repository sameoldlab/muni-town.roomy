/**
 * SSE stream lifecycle: what keeps a connection that lives for hours honest.
 *
 * These run against the real response body with short real timers rather than
 * fake ones, because the behaviours under test (a stalled reader, a closed
 * controller, an abort racing a tick) are exactly where a fake clock would
 * agree with the code and a real stream would not.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { openSseStream, type SseStreamOptions } from "./sseStream.ts";
import {
  _resetSseRegistry,
  liveSseStreamCount,
  liveSseSubscriptions,
  sseConnectionCount,
} from "./transports/sse.ts";
import { PUSH_TRANSPORTS } from "./transports/types.ts";

const ALICE = "did:plc:alice";
const BODY = JSON.stringify({ type: "message", roomName: "general" });

const aborters: AbortController[] = [];

function options(overrides: Partial<SseStreamOptions> = {}): SseStreamOptions {
  const aborter = new AbortController();
  aborters.push(aborter);
  return {
    userDid: ALICE,
    signal: aborter.signal,
    maxAgeMs: 60_000,
    tickMs: 15,
    maxQueuedFrames: 32,
    holdsDispatcher: () => true,
    ...overrides,
  };
}

/** Collects decoded text from a response body as it arrives. */
function collect(response: Response) {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("response has no body");
  const decoder = new TextDecoder();
  let text = "";
  let done = false;
  const pump = (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        done = true;
        return;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  })();
  return {
    get text() {
      return text;
    },
    get done() {
      return done;
    },
    pump,
  };
}

async function until(
  condition: () => boolean,
  timeoutMs = 1500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await Bun.sleep(5);
  }
}

/** Deliver the way the dispatcher does: to each of the user's live targets. */
async function deliver(body = BODY): Promise<Array<"delivered" | "skipped" | "gone" | "retry">> {
  const transport = PUSH_TRANSPORTS["sse"];
  if (transport === undefined) throw new Error("sse transport not registered");
  const outcomes = [];
  for (const row of liveSseSubscriptions(ALICE)) {
    const outcome = await transport.deliver(
      {
        kind: "sse",
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        expirationTime: row.expirationTime,
      },
      body,
      {},
    );
    outcomes.push(outcome.outcome);
  }
  return outcomes;
}

afterEach(() => {
  for (const aborter of aborters.splice(0)) aborter.abort();
  _resetSseRegistry();
});

describe("openSseStream", () => {
  test("answers as an event stream that must not be cached or buffered", () => {
    const response = openSseStream(options());
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  test("sends a ready event first, advertising the lifetime", async () => {
    const received = collect(openSseStream(options({ maxAgeMs: 45_000 })));
    await until(() => received.text.includes("\n\n"));
    expect(received.text.startsWith("event: ready\ndata: ")).toBe(true);
    expect(received.text).toContain('"maxAgeMs":45000');
  });

  test("registers as one of the user's streams and receives deliveries", async () => {
    const received = collect(openSseStream(options()));
    expect(liveSseStreamCount(ALICE)).toBe(1);
    expect(await deliver()).toEqual(["delivered"]);
    await until(() => received.text.includes("event: push"));
    expect(received.text).toContain(`event: push\ndata: ${BODY}\n\n`);
  });

  test("sends keepalive comments while idle", async () => {
    const received = collect(openSseStream(options()));
    await until(() => received.text.includes(": keepalive\n\n"));
  });

  test("two streams for one user each receive the delivery", async () => {
    const laptop = collect(openSseStream(options()));
    const desktop = collect(openSseStream(options()));
    expect(liveSseStreamCount(ALICE)).toBe(2);
    expect(await deliver()).toEqual(["delivered", "delivered"]);
    await until(() => laptop.text.includes("event: push"));
    await until(() => desktop.text.includes("event: push"));
  });

  test("ends and unregisters when the client disconnects", async () => {
    const aborter = new AbortController();
    const received = collect(openSseStream(options({ signal: aborter.signal })));
    await until(() => received.text.includes("event: ready"));
    aborter.abort();
    await until(() => liveSseStreamCount(ALICE) === 0);
    await until(() => received.done);
  });

  test("an already-aborted request never leaves a registered stream", () => {
    const aborter = new AbortController();
    aborter.abort();
    openSseStream(options({ signal: aborter.signal }));
    expect(liveSseStreamCount(ALICE)).toBe(0);
  });

  test("ends after its maximum age so a handshake is not trusted forever", async () => {
    const received = collect(openSseStream(options({ maxAgeMs: 60 })));
    await until(() => received.done);
    expect(sseConnectionCount()).toBe(0);
  });

  test("closes when this replica stops holding the dispatcher lease", async () => {
    let holds = true;
    const received = collect(
      openSseStream(options({ holdsDispatcher: () => holds })),
    );
    await until(() => received.text.includes("event: ready"));
    holds = false;
    await until(() => received.done);
    expect(sseConnectionCount()).toBe(0);
  });

  test("drops a client that stops reading instead of buffering for it", async () => {
    // Never read the body: the queue can only fill.
    openSseStream(options({ maxQueuedFrames: 2, tickMs: 60_000 }));
    expect(await deliver()).toEqual(["delivered"]);
    expect(await deliver()).toEqual(["skipped"]);
    expect(liveSseStreamCount(ALICE)).toBe(0);
    expect(await deliver()).toEqual([]);
  });
});
