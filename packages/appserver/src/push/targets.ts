/**
 * Where a push for a user can go right now.
 *
 * Web Push, APNs and FCM destinations are rows in `push_subscriptions`. SSE
 * destinations are not stored at all: they exist exactly as long as the
 * device's stream is open, and live in the stream registry. Both the "does
 * this user have anywhere to notify?" gate in `evaluate.ts` and the delivery
 * loop in `dispatcher.ts` need the union, so the rule lives here once.
 *
 * A stored row with `kind = 'sse'` is ignored. Nothing writes one (the
 * registration endpoint refuses the kind), and the only way one could exist is
 * a client sending it before that check was in place. Honouring it would
 * create a target no stream can ever match.
 */

import type { DbLike } from "../db/types.ts";
import {
  selectSubscriptions,
  type PushSubscriptionRow,
} from "../queries/pushSubscriptions.ts";
import { liveSseSubscriptions } from "./transports/sse.ts";

export async function selectPushTargets(
  db: DbLike,
  userDid: string,
): Promise<PushSubscriptionRow[]> {
  const storedRows = await selectSubscriptions(db, userDid);
  return [
    ...storedRows.filter((row) => row.kind !== "sse"),
    ...liveSseSubscriptions(userDid),
  ];
}
