import { afterEach, describe, expect, test } from "bun:test";
import {
  closeAllSseConnections,
  closeSseConnection,
  frameSseEvent,
  hasSseConnection,
  registerSseConnection,
  sseConnectionCount,
  unregisterSseConnection,
  type SseConnection,
} from "./sse.ts";
import { PUSH_TRANSPORTS, type PushTarget } from "./types.ts";

const ENDPOINT = "did:plc:alice#client-0123456789abcdef";
const OTHER = "did:plc:bob#client-0123456789abcdef";
const TARGET: PushTarget = { kind: "sse", endpoint: ENDPOINT, expirationTime: null };
const BODY = JSON.stringify({ type: "message", roomName: "general" });

function fake(endpoint: string, ok = true): SseConnection & { frames: string[]; reasons: string[] } {
  const c = { endpoint, frames: [] as string[], reasons: [] as string[],
    send(f: string) { if (!ok) return false; c.frames.push(f); return true; },
    close(r: string) { c.reasons.push(r); unregisterSseConnection(c); } };
  return c;
}

function t() { const x = PUSH_TRANSPORTS["sse"]; if (!x) throw new Error("no sse"); return x; }

afterEach(() => { closeAllSseConnections("test-reset"); });

describe("sse transport", () => {
  test("delivers to the registered endpoint", async () => {
    const c = fake(ENDPOINT);
    registerSseConnection(c);
    expect(await t().deliver(TARGET, BODY, {})).toEqual({ outcome: "delivered", status: null });
    expect(c.frames).toEqual([`event: push\ndata: ${BODY}\n\n`]);
  });

  test("skipped when no connection exists", async () => {
    expect(await t().deliver(TARGET, BODY, {})).toEqual({ outcome: "skipped", status: null });
  });

  test("skipped when connection refuses the frame", async () => {
    registerSseConnection(fake(ENDPOINT, false));
    expect(await t().deliver(TARGET, BODY, {})).toEqual({ outcome: "skipped", status: null });
  });

  test("does not deliver to another endpoint", async () => {
    registerSseConnection(fake(OTHER));
    expect((await t().deliver(TARGET, BODY, {})).outcome).toBe("skipped");
  });

  test("refuses a body with a line break", async () => {
    const c = fake(ENDPOINT);
    registerSseConnection(c);
    const o = await t().deliver(TARGET, 'x\n\nevent: push\ndata: {"forged":true}', {});
    expect(o.outcome).toBe("retry");
    expect(c.frames).toEqual([]);
  });
});

describe("registry", () => {
  test("reconnect replaces predecessor", () => {
    const a = fake(ENDPOINT), b = fake(ENDPOINT);
    registerSseConnection(a);
    registerSseConnection(b);
    expect(a.reasons).toEqual(["replaced-by-reconnect"]);
    expect(sseConnectionCount()).toBe(1);
  });

  test("late unregister does not evict successor", async () => {
    const a = fake(ENDPOINT), b = fake(ENDPOINT);
    registerSseConnection(a);
    registerSseConnection(b);
    unregisterSseConnection(a);
    expect(hasSseConnection(ENDPOINT)).toBe(true);
    expect((await t().deliver(TARGET, BODY, {})).outcome).toBe("delivered");
  });

  test("closeSseConnection closes by endpoint", () => {
    const c = fake(ENDPOINT);
    registerSseConnection(c);
    expect(closeSseConnection(ENDPOINT, "unregistered")).toBe(true);
    expect(c.reasons).toEqual(["unregistered"]);
    expect(closeSseConnection(ENDPOINT, "unregistered")).toBe(false);
  });

  test("closeAllSseConnections closes every stream", () => {
    const a = fake(ENDPOINT), b = fake(OTHER);
    registerSseConnection(a);
    registerSseConnection(b);
    closeAllSseConnections("lease-lost");
    expect(a.reasons).toEqual(["lease-lost"]);
    expect(b.reasons).toEqual(["lease-lost"]);
    expect(sseConnectionCount()).toBe(0);
  });
});

describe("frameSseEvent", () => {
  test("frames a single-line body", () => {
    expect(frameSseEvent("push", '{"a":1}')).toBe('event: push\ndata: {"a":1}\n\n');
  });
  test.each(["a\nb", "a\rb", "a\r\nb"])("rejects %j", (b) => {
    expect(frameSseEvent("push", b)).toBeNull();
  });
});
