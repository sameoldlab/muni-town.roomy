// import * as jose from "jose"
import { PushTransport } from "./types";

export const fcmTransport: PushTransport = {
  name: 'fcm',
  isConfigured() {
    return false
  },
  async send(sub, payload, opts) {
    return { kind: "gone" }
  },
}

/*
type ServiceAccount = {
  client_email: string;
  private_key: string
}

export async function getFcmAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new jose.SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setSubject(serviceAccount.client_email)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await jose.importPKCS8(serviceAccount.private_key, "RS256"));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const { access_token } = await res.json();
  return access_token;
}

export const fcmTransport: PushTransport = {
    name: "fcm",
    isConfigured: function(): boolean {
        throw new Error("Function not implemented.");
    },
    send: async (sub, payload, opts) => {
        if (sub.transport != 'fcm') throw Error("Never run");
        const accessToken = await getFcmAccessToken({});

        const message = {
            message: {
                token: sub.endpoint,
                data: {
                    payload,
                    ...opts.topic && { collapse_key: opts.topic },
                },
                android: {
                    priority: opts.urgency === 'high' ? 'HIGH' : 'NORMAL',
                    ttl: `${opts.ttl ?? 2419200}s`,
                }
            }
        };

        const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${sub.fcmProjectId}/messages:send`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": 'application/json'
                },
                body: JSON.stringify(message)
            });

        if (res.ok) return { kind: "ok", status: res.status };

        // Token unregistered (app uninstalled)
        if (res.status === 404) return { kind: "gone" };
        if (res.status === 429) return {
            kind: "retry",
            backoffMs: parseInt(res.headers.get("retry-after") ?? "60000")
        };
        return { kind: "skipped", reason: JSON.stringify(res.status) };
    },
}
*/
