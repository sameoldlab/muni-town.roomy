/**
 * Stream route: space.roomy.push.stream (GET, text/event-stream).
 *
 * The long-lived connection a desktop shell holds open to receive pushes.
 * There is nothing to register first. The caller authenticates exactly as it
 * does for every other route, with a service-auth JWT:
 *
 *     GET /xrpc/space.roomy.push.stream
 *     Authorization: Bearer <service-auth JWT, aud = this appserver>
 *
 * The JWT is the webview's, borrowed by the shell's native side for the
 * handshake and discarded afterwards. It is checked once, here, and the stream
 * deliberately does not look at it again: it expires in minutes and the stream
 * lasts an hour, so tying the two together would end every stream early.
 * Instead the stream has its own hard lifetime (`SSE_MAX_AGE_MS`), after which
 * the client reconnects with a freshly borrowed token.
 *
 * Checks run cheapest first:
 *
 *   1. This replica holds the dispatcher lease, else 503 + Retry-After. Only
 *      the lease holder delivers, so only it may own streams. This runs before
 *      authentication so a replica that cannot serve the request does not pay
 *      for a DID-document lookup to say so.
 *   2. The bearer token verifies and names a user (401).
 *   3. There is room for one more stream (503 + Retry-After). A user who
 *      already holds a stream does not need a new slot: a reconnect should not
 *      be turned away because its own dead socket is still counted.
 */

import { holdsPushDispatcher } from "../push/dispatcher.ts";
import { openSseStream } from "../push/sseStream.ts";
import {
  liveSseStreamCount,
  sseConnectionCount,
} from "../push/transports/sse.ts";
import { parseUserDid } from "../xrpc/authGuards.ts";
import type { StreamContext, StreamHandler } from "../xrpc/types.ts";

export interface PushStreamLimits {
  /** Most concurrent streams this process will hold. */
  maxStreams: number;
  /** Lifetime of one stream before a forced reconnect. */
  maxAgeMs: number;
  /** Keepalive / lease-check interval. */
  tickMs: number;
  /** Frames queued for a slow client before it is dropped. */
  maxQueuedFrames: number;
}

export interface PushStreamDeps {
  holdsDispatcher: () => boolean;
  /** Streams this user already holds on this replica. */
  userStreamCount: (userDid: string) => number;
  /** Streams held on this replica in total. */
  totalStreamCount: () => number;
  limits: PushStreamLimits;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function defaultPushStreamLimits(): PushStreamLimits {
  return {
    maxStreams: positiveIntFromEnv("SSE_MAX_STREAMS", 2000),
    maxAgeMs: positiveIntFromEnv("SSE_MAX_AGE_MS", 60 * 60 * 1000),
    tickMs: positiveIntFromEnv("SSE_TICK_MS", 20_000),
    maxQueuedFrames: positiveIntFromEnv("SSE_MAX_QUEUED_FRAMES", 32),
  };
}

function errorResponse(
  status: number,
  error: string,
  message: string,
  retryAfterSeconds?: number,
): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }
  return Response.json({ error, message }, { status, headers });
}

export function createPushStreamHandler(deps: PushStreamDeps): StreamHandler {
  return async (req: Request, context: StreamContext): Promise<Response> => {
    if (!deps.holdsDispatcher()) {
      return errorResponse(
        503,
        "NotDispatcher",
        "This replica does not own push delivery; retry",
        5,
      );
    }

    const userDid = parseUserDid(await context.authenticate());
    if (userDid === null) {
      return errorResponse(
        401,
        "AuthRequired",
        "A valid service-auth token is required",
      );
    }

    if (
      deps.userStreamCount(userDid) === 0 &&
      deps.totalStreamCount() >= deps.limits.maxStreams
    ) {
      return errorResponse(
        503,
        "StreamCapacity",
        "Stream capacity reached; retry",
        30,
      );
    }

    return openSseStream({
      userDid,
      signal: req.signal,
      maxAgeMs: deps.limits.maxAgeMs,
      tickMs: deps.limits.tickMs,
      maxQueuedFrames: deps.limits.maxQueuedFrames,
      holdsDispatcher: deps.holdsDispatcher,
    });
  };
}

export const pushStreamHandler: StreamHandler = createPushStreamHandler({
  holdsDispatcher: holdsPushDispatcher,
  userStreamCount: liveSseStreamCount,
  totalStreamCount: sseConnectionCount,
  limits: defaultPushStreamLimits(),
});
