import { PushTransport } from "./types";

export const apnTransport: PushTransport = {
  name: 'apn',
  isConfigured() {
    return false
  },
  async send(sub, payload, opts) {

    return { kind: "gone" }
  },
}
