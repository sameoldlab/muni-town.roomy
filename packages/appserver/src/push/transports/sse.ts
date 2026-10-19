/**
 * Server-Sent Events transport.
 *
 * SSE connection happens in 2 phases. Client applicaion sends
 * xrpc/space.roomy.push.registerSubscripton with the expected
 * JWT and a client_id. This creates a row in push_subscriptions,
 * uniquely tied to a specific application. To begin receiving
 * push notification events, a second request is made to
 * space.roomy.push.stream which, after checking for an active
 * registration, returns a Request EventStream. This keeps
 * subscription management within the same schema as other
 * transports, while opening a new channel for the response type
 * needed by SSE.
 *
 * It answers `skipped` for every row while that connection registry does not
 * exist, so a stored `sse` row is counted as "a transport declined" and left in
 * place. It must never answer `gone` — a connected device is by definition
 * reachable, and pruning the row would be the opposite of the truth.
 *
 * When built, delivery writes to the connection's response stream and the
 * outcome is local rather than a remote status: an endpoint with no open
 * connection is `skipped` (the device is simply not open right now, which is
 * not a failure), and a write error is `retry`.
 *
 * Outcomes:
 *  - the connection is closed or too far behind to take the frame → `skipped`
 *    (it has been dropped; the client reconnects on its own);
 *  - never `gone`: there is no row to prune, and a stream that ended is simply
 *    absent from the registry the next time targets are enumerated;
 *  - `retry` only for a body that cannot be framed safely.
 */

import { log } from "../../log.ts";
import type { PushSubscriptionRow } from "../../queries/pushSubscriptions.ts";
import {
  PUSH_TRANSPORTS,
  type PushDeliveryOptions,
  type PushOutcome,
  type PushTarget,
  type PushTransport,
} from "./types.ts";

/** What a connection reports for one attempted write. */
export type SseWriteResult = "written" | "closed" | "backlogged";

/**
 * One open stream as the registry and transport see it. The HTTP plumbing
 * (response body, timers) lives in `push/sseStream.ts`; this interface is the
 * seam that keeps the transport testable without a socket.
 */
export interface SseConnection {
  /** Unique per connection; the `endpoint` of the target built from it. */
  readonly id: string;
  readonly userDid: string;
  /** Write one complete SSE frame. A backlogged connection closes itself. */
  send(frame: string): SseWriteResult;
  close(reason: string): void;
}

/**
 * Streams one account may hold at once. A client that changes network leaves a
 * half-open socket behind until the next write fails, and it reconnects before
 * then, so a user is normally at two for a while. The cap bounds the worst
 * case, and the oldest stream is the one to go: it is the most likely zombie.
 */
const connectionsById = new Map<string, SseConnection>();
/** Connection ids per user, oldest first. */
const idsByUser = new Map<string, string[]>();

/**
 * Add `connection` to the registry, closing the user's oldest streams while
 * they are over {@link MAX_SSE_STREAMS_PER_USER}.
 */
export function registerSseConnection(connection: SseConnection): void {
  connectionsById.set(connection.id, connection);
  const userIds = idsByUser.get(connection.userDid) ?? [];
  userIds.push(connection.id);
  idsByUser.set(connection.userDid, userIds);

  while (userIds.length > MAX_SSE_STREAMS_PER_USER) {
    const oldestId = userIds[0];
    if (oldestId === undefined) break;
    const oldest = connectionsById.get(oldestId);
    if (oldest === undefined) {
      userIds.shift();
      continue;
    }
    // `close` unregisters, which removes the id from `userIds`.
    oldest.close("evicted-by-newer-stream");
    if (userIds[0] === oldestId) {
      userIds.shift();
      connectionsById.delete(oldestId);
    }
  }
}

/**
 * Remove `connection` if it is still the registered one. Identity matters: a
 * stream finishing late must not evict anything else.
 */
export function unregisterSseConnection(connection: SseConnection): void {
  if (connectionsById.get(connection.id) !== connection) return;
  connectionsById.delete(connection.id);
  const userIds = idsByUser.get(connection.userDid);
  if (userIds === undefined) return;
  const index = userIds.indexOf(connection.id);
  if (index !== -1) userIds.splice(index, 1);
  if (userIds.length === 0) idsByUser.delete(connection.userDid);
}

/** How many streams `userDid` holds open right now. */
export function liveSseStreamCount(userDid: string): number {
  return idsByUser.get(userDid)?.length ?? 0;
}

/**
 * The user's open streams as subscription-row-shaped targets, for the
 * dispatcher to deliver to alongside their stored rows. `endpoint` is the
 * connection id; the keys are empty, as for any native transport.
 */
export function liveSseSubscriptions(userDid: string): PushSubscriptionRow[] {
  const userIds = idsByUser.get(userDid);
  if (userIds === undefined) return [];
  return userIds.map((connectionId) => ({
    userDid,
    endpoint: connectionId,
    kind: "sse",
    p256dh: "",
    auth: "",
    expirationTime: null,
  }));
}

/** Total open streams on this replica. */
export function sseConnectionCount(): number {
  return connectionsById.size;
}

/** Close every stream. Call on lost leasee or shutdown. */
export function closeAllSseConnections(reason: string): void {
  for (const connection of [...connectionsById.values()]) {
    connection.close(reason);
  }
}

/** Test hook: drop all registry state without closing anything. */
export function _resetSseRegistry(): void {
  connectionsById.clear();
  idsByUser.clear();
}

/**
 * Frame a payload as one SSE event. `body` is `JSON.stringify` output, which
 * escapes line breaks, so it cannot contain the CR or LF that would end the
 * `data:` line and let a payload forge further events. Anything else is
 * refused rather than sanitised: a body that reaches here with a line break
 * is a bug upstream, and silently rewriting it would hide that.
 */
export function frameSseEvent(eventName: string, body: string): string | null {
  if (/[\r\n]/.test(body) || /[\r\n]/.test(eventName)) return null;
  return `event: ${eventName}\ndata: ${body}\n\n`;
}

const sseTransport: PushTransport = {
  kind: "sse",
  isConfigured: () => true,
  async deliver(
    target: PushTarget,
    body: string,
    _options: PushDeliveryOptions,
  ): Promise<PushOutcome> {
    const frame = frameSseEvent("push", body);
    if (frame === null) {
      return {
        outcome: "retry",
        status: null,
        error: new Error("sse: payload body contains a line break"),
      };
    }

    const connection = connectionsById.get(target.endpoint);
    if (connection === undefined) return { outcome: "skipped", status: null };

    const result = connection.send(frame);
    if (result === "written") return { outcome: "delivered", status: null };

    log.debug(`[sse] dropped delivery result=${result}`);
    return { outcome: "skipped", status: null };
  },
};

PUSH_TRANSPORTS[sseTransport.kind] = sseTransport;
