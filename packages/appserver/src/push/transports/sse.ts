import { PushTransport } from "./types";

export const sseTransport: PushTransport = {
  name: 'sse',
  isConfigured() {
    return false
  },
  async send(sub, payload, opts) {

    return { kind: "gone" }
  },
}
