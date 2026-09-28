import { PushSubscriptionRow } from "../../queries/pushSubscriptions";
import { PushPayload } from "../types";

export type SendResult =
  | { kind: "ok"; status: number | null }
  | { kind: "gone" }
  // not configured
  | { kind: "skipped"; reason: string | object }
  // errors
  | { kind: "retry"; backoffMs: number }
  //{ kind: "failed"; reason}

export type SendOptions = {
  topic?: string;
  // webPush: urgency, FCM/APN: Priority
  urgency: "low" | "normal" | "high",
  ttl?: number
}

export interface PushTransport<S extends PushSubscriptionRow = PushSubscriptionRow> {
  readonly name: S["transport"];
  isConfigured(): boolean;
  send(sub: S, payload: PushPayload, opts: SendOptions): Promise<SendResult>
}

export type Transport = PushSubscriptionRow["transport"]
