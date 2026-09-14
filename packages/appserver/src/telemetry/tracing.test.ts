import { describe, expect, test } from "bun:test";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  type SpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { resolveTraceEndpoint, _resetTracing, withSpan, currentTraceContext, initTracing, isTracingEnabled } from "./tracing.ts";

// Collects finished spans so a test can assert on status, attributes and
// parentage without an exporter or network.
let captured: ReadableSpan[] = [];
function capturingProcessor(): SpanProcessor {
  return {
    onStart: () => {},
    onEnd: (span) => captured.push(span),
    shutdown: async () => {},
    forceFlush: async () => {},
  };
}

describe("tracing config", () => {
  test("resolveTraceEndpoint returns null when nothing is set", () => {
    expect(resolveTraceEndpoint({})).toBeNull();
  });
  test("base endpoint gets /v1/traces appended", () => {
    expect(resolveTraceEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://alloy.railway.internal:4318" }))
      .toBe("http://alloy.railway.internal:4318/v1/traces");
  });
  test("base endpoint trailing slash is not doubled", () => {
    expect(resolveTraceEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://x:4318/" }))
      .toBe("http://x:4318/v1/traces");
  });
  test("signal-specific endpoint wins verbatim", () => {
    expect(resolveTraceEndpoint({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://ignored:4318",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://custom:9999/custom/path",
    })).toBe("http://custom:9999/custom/path");
  });
  test("initTracing is a no-op without an endpoint", () => {
    _resetTracing();
    expect(initTracing({})).toBe(false);
    expect(isTracingEnabled()).toBe(false);
    _resetTracing();
  });
  test("withSpan still runs the callback when tracing is disabled", async () => {
    _resetTracing();
    initTracing({});
    let ran = false;
    const out = await withSpan("noop", {}, async () => { ran = true; return 7; });
    expect(ran).toBe(true);
    expect(out).toBe(7);
    _resetTracing();
  });
  test("withSpan propagates errors when disabled", async () => {
    _resetTracing();
    initTracing({});
    await expect(withSpan("boom", {}, async () => { throw new Error("kaboom"); }))
      .rejects.toThrow("kaboom");
    _resetTracing();
  });
  test("currentTraceContext is null with tracing off", async () => {
    _resetTracing();
    initTracing({});
    await withSpan("notraced", {}, async () => {
      expect(currentTraceContext()).toBeNull();
    });
    _resetTracing();
  });
});

describe("tracing enabled", () => {
  // A provider with no exporter: spans are recorded, but nothing is sent, so
  // the assertions below are hermetic (no collector, no socket). Returns the
  // list the finished spans are captured into.
  function initSilent(): ReadableSpan[] {
    _resetTracing();
    captured = [];
    const cm = new AsyncLocalStorageContextManager();
    cm.enable();
    context.setGlobalContextManager(cm);
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [capturingProcessor()] }),
    );
    return captured;
  }

  test("nests child spans under the parent and reports a real trace id", async () => {
    const spans = initSilent();
    await withSpan("root", { a: 1 }, async (root) => {
      await withSpan("child", {}, async (child) => {
        // Same trace, different span.
        expect(child.spanContext().traceId).toBe(root.spanContext().traceId);
        expect(child.spanContext().spanId).not.toBe(root.spanContext().spanId);
        // The log-correlation helper reports the innermost active span.
        const ctx = currentTraceContext();
        expect(ctx?.traceId).toBe(root.spanContext().traceId);
        expect(ctx?.spanId).toBe(child.spanContext().spanId);
      });
    });

    // Parentage as recorded on the finished spans: the child's parent is the
    // root, and the root has no parent.
    const root = spans.find((s) => s.name === "root")!;
    const child = spans.find((s) => s.name === "child")!;
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(root.parentSpanContext).toBeUndefined();
    _resetTracing();
  });

  test("sibling calls get distinct trace ids", async () => {
    initSilent();
    let first = "";
    await withSpan("a", {}, async (s) => { first = s.spanContext().traceId; });
    let second = "";
    await withSpan("b", {}, async (s) => { second = s.spanContext().traceId; });
    expect(first).not.toBe(second);
    _resetTracing();
  });

  test("a throwing body records the exception and ERROR status", async () => {
    const spans = initSilent();
    await expect(
      withSpan("failing", {}, async (span) => {
        span.setAttribute("phase", "before-throw");
        throw new Error("inner blew up");
      }),
    ).rejects.toThrow("inner blew up");

    const span = spans.find((s) => s.name === "failing");
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.status.message).toBe("inner blew up");
    expect(span!.events.some((e) => e.name === "exception")).toBe(true);
    // The span still ends (is exported) despite the throw. OTel v2 exposes
    // duration as an [seconds, nanos] tuple.
    const [durSec, durNano] = span!.duration;
    expect(durSec * 1e9 + durNano).toBeGreaterThan(0);
    _resetTracing();
  });

  test("successful body sets OK status and keeps attributes", async () => {
    const spans = initSilent();
    await withSpan("okspan", { "roomy.space_id": "did:web:x" }, async () => "result");

    const span = spans.find((s) => s.name === "okspan");
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.OK);
    expect(span!.attributes["roomy.space_id"]).toBe("did:web:x");
    _resetTracing();
  });
});
