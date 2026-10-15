/**
 * The HTTP side of one SSE connection: the response body, the timers that keep
 * it honest, and the rules for ending it.
 *
 * Web Push, APNs and FCM hand a payload to someone else and are done. An SSE
 * stream is a promise the appserver keeps open for hours, so everything those
 * transports get for free has to be enforced here, for the life of the stream:
 *
 *  - Bounded memory. The body queue holds a fixed number of frames. A client
 *    that stops reading is dropped, not buffered for: it reconnects on its
 *    own, and an unbounded queue per slow client is a denial of service.
 *  - Bounded lifetime. A stream ends after `maxAgeMs` (jittered so a deploy
 *    does not reconnect everyone in the same second), forcing the client to
 *    present a fresh token instead of one handshake being good indefinitely.
 *    The token is checked once, at connect, and never again: it is short-lived
 *    and the stream is not, so nothing here may depend on it staying valid.
 *  - Ownership of delivery. Only the dispatcher-lease holder delivers, so a
 *    replica that loses the lease closes its streams and clients reconnect to
 *    the new holder.
 *
 * Timing and the lease check are injected, so the tests drive all of it
 * without sockets, sleeps or a database.
 */

import { log } from "../log.ts";
import {
  registerSseConnection,
  unregisterSseConnection,
  type SseConnection,
  type SseWriteResult,
} from "./transports/sse.ts";

export interface SseStreamOptions {
  /** The authenticated account this stream delivers to. */
  userDid: string;
  /** Aborts when the client disconnects (`Request.signal`). */
  signal: AbortSignal;
  /** Stream lifetime before a forced reconnect. */
  maxAgeMs: number;
  /** Interval for keepalive and lease-check ticks. */
  tickMs: number;
  /** Frames the body queue may hold before the client counts as stalled. */
  maxQueuedFrames: number;
  /** Whether this replica still owns delivery. */
  holdsDispatcher: () => boolean;
}

const KEEPALIVE_FRAME = ": keepalive\n\n";

/** Stretch or shrink `value` by up to `fraction` so deadlines do not align. */
function jitter(value: number, fraction: number): number {
  const offset = (Math.random() * 2 - 1) * fraction;
  return Math.max(1, Math.round(value * (1 + offset)));
}

/** Build the streaming response and register it as one of the user's streams. */
export function openSseStream(options: SseStreamOptions): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let ageTimer: ReturnType<typeof setTimeout> | undefined;

  function close(reason: string): void {
    if (closed) return;
    closed = true;
    if (tickTimer !== undefined) clearInterval(tickTimer);
    if (ageTimer !== undefined) clearTimeout(ageTimer);
    unregisterSseConnection(connection);
    try {
      controller?.close();
    } catch {
      // Already closed by the client; nothing left to release.
    }
    log.debug(`[sse] stream closed reason=${reason}`);
  }

  function write(frame: string): SseWriteResult {
    if (closed || controller === undefined) return "closed";
    if ((controller.desiredSize ?? 0) <= 0) {
      close("client-stalled");
      return "backlogged";
    }
    try {
      controller.enqueue(encoder.encode(frame));
      return "written";
    } catch {
      close("write-failed");
      return "closed";
    }
  }

  const connection: SseConnection = {
    id: crypto.randomUUID(),
    userDid: options.userDid,
    send: write,
    close,
  };

  const body = new ReadableStream<Uint8Array>(
    {
      start(streamController) {
        controller = streamController;
        const ready = JSON.stringify({ maxAgeMs: options.maxAgeMs });
        streamController.enqueue(
          encoder.encode(`event: ready\ndata: ${ready}\n\n`),
        );
      },
      cancel() {
        close("client-cancelled");
      },
    },
    { highWaterMark: options.maxQueuedFrames, size: () => 1 },
  );

  function tick(): void {
    if (closed) return;
    if (!options.holdsDispatcher()) {
      close("lease-lost");
      return;
    }
    write(KEEPALIVE_FRAME);
  }

  registerSseConnection(connection);
  tickTimer = setInterval(tick, options.tickMs);
  ageTimer = setTimeout(() => close("max-age"), jitter(options.maxAgeMs, 0.1));
  // Neither timer is a reason for the process to stay alive.
  (tickTimer as { unref?: () => void }).unref?.();
  (ageTimer as { unref?: () => void }).unref?.();

  if (options.signal.aborted) {
    close("client-aborted");
  } else {
    options.signal.addEventListener("abort", () => close("client-aborted"), {
      once: true,
    });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Ask intermediaries (nginx-style proxies) not to buffer the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
