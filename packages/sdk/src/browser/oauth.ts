/**
 * Browser OAuth lifecycle for Roomy apps.
 *
 * This is the **only** module in `@roomy/sdk` that imports
 * `@atproto/oauth-client-browser` and `sessionStorage`. The core SDK
 * never imports it; the `/browser` subpath export ensures appserver
 * builds don't pull it in transitively.
 *
 * @module @roomy/sdk/browser
 */

import {
  BrowserOAuthClient,
  atprotoLoopbackClientMetadata,
  buildLoopbackClientId,
  OAuthCallbackError,
} from "@atproto/oauth-client-browser";
import { Agent } from "@atproto/api";
import type { OAuthSession } from "@atproto/oauth-client-browser";

// Tauri JS API is exposed on `window.__TAURI__` when `withGlobalTauri` is
// enabled. The SDK is app-agnostic (no dependency on @tauri-apps/api), so
// this declares just the parts needed.
// Tauri apps gate access on the runtime check `'__TAURI__' in window`.
declare global {
  interface Window {
    __TAURI__?: {
      opener: {
        openUrl(url: string | URL): Promise<void>;
      };
      deepLink: {
        onOpenUrl(handler: (urls: string[]) => void): Promise<() => void>;
      };
    };
  }
}

// ── Config ────────────────────────────────────────────────────────────────

const HANDLE_RESOLVER = "https://bsky.social";

export const DEFAULT_APPSERVER_DID = "did:web:appserver.roomy.chat";

// ── Lexicon definitions (for atproto agent proxy) ─────────────────────────
//
// Generated lexicons live in ../schemas/lexicons/*.json and are auto-generated
// from the arktype schemas by `pnpm generate:lexicons`. Admin-only NSIDs
// that have no arktype schema are defined inline below.

import lexGetConnectionTicket from "../schemas/lexicons/space.roomy.auth.getConnectionTicket.json";
import lexGetMessage from "../schemas/lexicons/space.roomy.message.getMessage.json";
import lexGetMessages from "../schemas/lexicons/space.roomy.room.getMessages.json";
import lexGetRoomMetadata from "../schemas/lexicons/space.roomy.room.getMetadata.json";
import lexGetRoomThreads from "../schemas/lexicons/space.roomy.room.getThreads.json";
import lexUpdateSeen from "../schemas/lexicons/space.roomy.room.updateSeen.json";
import lexCreateSpace from "../schemas/lexicons/space.roomy.space.createSpace.json";
import lexGetInvites from "../schemas/lexicons/space.roomy.space.getInvites.json";
import lexGetMembers from "../schemas/lexicons/space.roomy.space.getMembers.json";
import lexGetSpaceMetadata from "../schemas/lexicons/space.roomy.space.getMetadata.json";
import lexGetRoles from "../schemas/lexicons/space.roomy.space.getRoles.json";
import lexGetSpaces from "../schemas/lexicons/space.roomy.space.getSpaces.json";
import lexGetActivityFeed from "../schemas/lexicons/space.roomy.space.getActivityFeed.json";
import lexGetSpaceThreads from "../schemas/lexicons/space.roomy.space.getThreads.json";
import lexJoinSpace from "../schemas/lexicons/space.roomy.space.joinSpace.json";
import lexLeaveSpace from "../schemas/lexicons/space.roomy.space.leaveSpace.json";
import lexSendEvents from "../schemas/lexicons/space.roomy.space.sendEvents.json";
import lexGetVapidPublicKey from "../schemas/lexicons/space.roomy.push.getVapidPublicKey.json";
import lexRegisterSubscription from "../schemas/lexicons/space.roomy.push.registerSubscription.json";
import lexUnregisterSubscription from "../schemas/lexicons/space.roomy.push.unregisterSubscription.json";
import lexGetPreferences from "../schemas/lexicons/space.roomy.push.getPreferences.json";
import lexSetPreferences from "../schemas/lexicons/space.roomy.push.setPreferences.json";
import lexGetFlags from "../schemas/lexicons/space.roomy.getFlags.json";
/** Admin/internal NSIDs that have no arktype schema (so no generated lexicon). */
const ADMIN_LEXICONS = [
  {
    lexicon: 1,
    id: "space.roomy.admin.connectSpace",
    defs: {
      main: {
        type: "query" as const,
        parameters: {
          type: "params" as const,
          required: ["did"],
          properties: { did: { type: "string" as const } },
        },
        output: {
          encoding: "application/json",
          schema: { type: "object" as const },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: "space.roomy.admin.materializeSpace",
    defs: {
      main: {
        type: "query" as const,
        parameters: {
          type: "params" as const,
          required: ["did"],
          properties: {
            did: { type: "string" as const },
            wait: { type: "string" as const },
          },
        },
        output: {
          encoding: "application/json",
          schema: { type: "object" as const },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: "space.roomy.admin.getFlags",
    defs: {
      main: {
        type: "query" as const,
        output: {
          encoding: "application/json",
          schema: {
            type: "object" as const,
            required: ["flags"],
            properties: {
              flags: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  required: ["key", "description", "globalEnabled", "assignedDids"],
                  properties: {
                    key: { type: "string" as const },
                    description: { type: "string" as const },
                    globalEnabled: { type: "boolean" as const },
                    assignedDids: {
                      type: "array" as const,
                      items: { type: "string" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: "space.roomy.admin.setFlag",
    defs: {
      main: {
        type: "procedure" as const,
        input: {
          encoding: "application/json",
          schema: {
            type: "object" as const,
            properties: {
              flag: { type: "string" as const },
              all: { type: "boolean" as const },
              userDids: {
                type: "array" as const,
                items: { type: "string" as const },
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: "space.roomy.admin.clearFlag",
    defs: {
      main: {
        type: "procedure" as const,
        input: {
          encoding: "application/json",
          schema: {
            type: "object" as const,
            required: ["flag"],
            properties: {
              flag: { type: "string" as const },
            },
          },
        },
      },
    },
  },
];

/** All Roomy lexicons, used by `makeProxiedAgent` to register on the atproto Agent. */
const LEXICONS = [
  lexGetConnectionTicket,
  lexGetMessage,
  lexGetMessages,
  lexGetRoomMetadata,
  lexGetRoomThreads,
  lexUpdateSeen,
  lexCreateSpace,
  lexGetInvites,
  lexGetMembers,
  lexGetSpaceMetadata,
  lexGetRoles,
  lexGetSpaces,
  lexGetActivityFeed,
  lexGetSpaceThreads,
  lexJoinSpace,
  lexLeaveSpace,
  lexSendEvents,
  lexGetVapidPublicKey,
  lexGetFlags,
  lexRegisterSubscription,
  lexUnregisterSubscription,
  lexGetPreferences,
  lexSetPreferences,
  ...ADMIN_LEXICONS,
];

// ── OAuth client setup ────────────────────────────────────────────────────

function buildScope(_appserverDid: string) {
  return "atproto transition:generic";
}

export interface CreateOAuthClientOptions {
  /** The port the local app listens on (for the loopback redirect URI). */
  port?: number;
  /**
   * OAuth scope string. If omitted, defaults to `atproto transition:generic`.
   * Callers that need explicit `rpc:` scopes (e.g. app-lite) pass them here.
   */
  scope?: string;
  /**
   * If true, fetch client metadata from `/oauth-client-metadata.json` instead
   * of building a loopback client. Used in production deployments.
   */
  usePublicClient?: boolean;
}

export async function createOAuthClient(
  appserverDid: string,
  opts: CreateOAuthClientOptions = {},
): Promise<BrowserOAuthClient> {
  const scope = opts.scope ?? buildScope(appserverDid);

  // Production: fetch public client metadata deployed alongside the static build
  if (opts.usePublicClient) {
    const resp = await fetch("/oauth-client-metadata.json", {
      headers: [["accept", "application/json"]],
    });
    const clientMetadata = await resp.json();
    return new BrowserOAuthClient({
      clientMetadata,
      handleResolver: HANDLE_RESOLVER,
      responseMode: "query",
    });
  } else if ('__TAURI__' in window) {
    return new BrowserOAuthClient({
      clientMetadata: {
      "client_id": "https://roomy.space/oauth-client-native.json",
      "redirect_uris": ["space.roomy:/", "https://roomy.space/"],
      "application_type": "native",
      "client_name": "Roomy Lite",
      "client_uri": "https://roomy.space",
      "logo_uri": "https://roomy.space/favicon.png",
      "scope": "atproto rpc:app.bsky.actor.getProfiles?aud=* rpc:app.bsky.actor.getProfile?aud=* blob:*/* repo:space.roomy.upload.v0 repo:space.roomy.space.handle.dev repo:space.roomy.space.personal.dev repo:space.roomy.user.profile rpc:com.atproto.server.getServiceAuth?aud=did:web:api.roomy.space rpc:space.roomy.space.getSpaces?aud=* rpc:space.roomy.space.getMetadata?aud=* rpc:space.roomy.space.getSpaceSummary?aud=* rpc:space.roomy.space.getThreads?aud=* rpc:space.roomy.space.getRoles?aud=* rpc:space.roomy.space.getMembers?aud=* rpc:space.roomy.space.getInvites?aud=* rpc:space.roomy.room.getMetadata?aud=* rpc:space.roomy.room.getRoomSummary?aud=* rpc:space.roomy.room.getMessages?aud=* rpc:space.roomy.room.getThreads?aud=* rpc:space.roomy.message.getMessage?aud=* rpc:space.roomy.message.getReactions?aud=* rpc:space.roomy.auth.getConnectionTicket?aud=* rpc:space.roomy.getFlags?aud=* rpc:space.roomy.room.updateSeen?aud=* rpc:space.roomy.space.sendEvents?aud=* rpc:space.roomy.space.createSpace?aud=* rpc:space.roomy.space.joinSpace?aud=* rpc:space.roomy.space.leaveSpace?aud=* rpc:space.roomy.space.setHandle?aud=* rpc:space.roomy.space.getCalendarLink?aud=* rpc:space.roomy.space.getCalendarEvents?aud=* rpc:space.roomy.space.getActivityFeed?aud=* rpc:space.roomy.user.getProfile?aud=* rpc:space.roomy.push.getVapidPublicKey?aud=* rpc:space.roomy.push.getPreferences?aud=* rpc:space.roomy.push.registerSubscription?aud=* rpc:space.roomy.push.unregisterSubscription?aud=* rpc:space.roomy.push.setPreferences?aud=*",
      "grant_types": ["authorization_code", "refresh_token"],
      "response_types": ["code"],
      "token_endpoint_auth_method": "none",
      "dpop_bound_access_tokens": true
    },
      handleResolver: HANDLE_RESOLVER,
      responseMode: "query",
    });
  }

  // Development: loopback client
  const port = opts.port ?? 5199;
  const baseUrl = new URL(`http://127.0.0.1:${port}`);
  baseUrl.hash = "";
  baseUrl.pathname = "/";
  const redirectUri = baseUrl.href;

  const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  return new BrowserOAuthClient({
    clientMetadata: {
      ...atprotoLoopbackClientMetadata(buildLoopbackClientId(baseUrl)),
      redirect_uris: [redirectUri],
      scope,
      client_id: clientId,
    },
    handleResolver: HANDLE_RESOLVER,
  });
}

// ── Proxied agent ─────────────────────────────────────────────────────────

/**
 * Create an atproto Agent configured to proxy XRPC calls through the
 * given appserver DID. Registers all known Roomy lexicons so the agent
 * knows how to serialize/deserialize them.
 */
export function makeProxiedAgent(agent: Agent, appserverDid: string): Agent {
  const proxied = agent.clone();
  proxied.configureProxy(
    `${appserverDid}#space_roomy_appserver` as unknown as Parameters<
      Agent["configureProxy"]
    >[0],
  );
  for (const lex of LEXICONS) proxied.lex.add(lex as any);
  return proxied;
}

// ── Appserver DID persistence ─────────────────────────────────────────────

const APPSERVER_DID_KEY = "appserver-did";

export function saveAppserverDid(did: string): void {
  sessionStorage.setItem(APPSERVER_DID_KEY, did);
}

export function loadAppserverDid(): string {
  return sessionStorage.getItem(APPSERVER_DID_KEY) || DEFAULT_APPSERVER_DID;
}

// ── Session lifecycle ─────────────────────────────────────────────────────

export interface InitSessionOptions {
  port?: number;
  scope?: string;
  usePublicClient?: boolean;
  /**
   * Opaque string carried through the OAuth round-trip via the `state`
   * parameter. Returned verbatim by `initSession()` once the callback is
   * processed. Apps use this to remember the URL the user was on before
   * signing in and redirect back to it after the PDS callback.
   */
  state?: string;
  /**
   * How long the Tauri login flow may stay pending before `login()`
   * resolves with `null` (user abandoned auth). Defaults to 10 minutes,
   * matching the PDS authorization-code / PKCE-state expiry — a callback
   * that arrives after this can never succeed, so giving up is safe.
   */
  loginTimeoutMs?: number;
}

/**
 * Try to restore an existing OAuth session (e.g. after a page reload or
 * redirect back from the PDS). Returns `{ session, agent, state }` if a
 * session was found, or `null` if the user is not authenticated. `state`
 * is the OAuth `state` value round-tripped through the PDS (present only
 * when this call processed an OAuth callback, not a plain session restore).
 */
export type = LoginResult {
  session: OAuthSession;
  agent: Agent;
  state?: string | null;
}

/** Result of {@link login}: a session on success, a failure reason otherwise. */
export type LoginOutcome = LoginResult |  {
  /** Why an OAuth login did not produce a session. */
  failure: LoginFailureReason = "timeout" | "rejected" | "invalid";
};

/**
 * Wait for the next deep-link event targeting this app. Resolves with the
 * first URL (e.g. `space.roomy:/?state=…&code=…`) or `null` on timeout.
 * The listener is removed on the first event (or after the timeout), so a
 * callback that arrives after `login()` gave up is silently dropped — which
 * is fine: the PDS authorization code and the client's PKCE state both
 * expire after ~10 minutes, so a late callback could never succeed anyway.
 */
async function waitForDeepLink(
  deepLink: NonNullable<Window["__TAURI__"]>["deepLink"],
  timeoutMs = 10 * 60_000,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unlisten: (() => void) | undefined;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unlisten?.();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    deepLink
      .onOpenUrl((urls) => done(urls[0] ?? null))
      .then((unlistenFn) => {
        unlisten = unlistenFn;
      });
  });
}

/**
 * Resolve with `promise`'s value, or `null` if it hasn't settled within
 * `timeoutMs`. Keeps `login()`'s abandoned-flow guarantee even when an
 * intermediate step (e.g. the opener IPC) never settles.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function initSession(
  appserverDid: string,
  opts: InitSessionOptions = {},
): Promise<LoginResult | null> {
  const client = await createOAuthClient(appserverDid, opts);

  /* 
   * Tauri / native custom-scheme callbacks can't be auto-detected by `client.init()`:
   * `findRedirectUrl()` compares HTTP origins against the
   * registered redirect URIs, and a `space.roomy:/…` scheme never matches the
   * webview origin (`tauri://localhost`). `login()`'s deep-link handler
   * navigates the webview here with the OAuth params in the query string, so
   * we process them explicitly.
   */
  if ('__TAURI__' in window) {
    const params = new URLSearchParams(location.search);
    if (params.has('state') && (params.has('code') || params.has('error'))) {
      const cbResult = await client.initCallback(params, client.clientMetadata.redirect_uris[0]);
      if (cbResult?.session) {
        return {
          session: cbResult.session,
          agent: new Agent(cbResult.session as any),
          state: cbResult.state,
        };
      }
    }
  }

  const result = await client.init();
  if (result?.session) {
    return {
      session: result.session,
      agent: new Agent(result.session as any),
      // `state` is only present when `init()` processed an OAuth callback
      // (URL contained callback params). On a plain session restore it is
      // `undefined`, so callers can distinguish the two cases.
      state: result.state,
    };
  }
  return null;
}

/**
 * Initiate an OAuth sign-in flow.
 *
 * Web: redirects the browser to the PDS authorization page; the promise does
 * **not** resolve in the current page context (the browser navigates away)
 * and the returned value is never reached.
 *
 * Tauri: opens the PDS in the system browser, then **blocks** until the
 * deep-link redirect (`space.roomy:/?state=…&code=…`) arrives and processes
 * the callback in place. Returns `{ session, agent, state }` on success, or a
 * `{ failure }` with a reason when the user rejected the request, abandoned
 * the flow (10-minute timeout), or the callback state was invalid.
 */
export async function login(
  appserverDid: string,
  handle: string,
  opts: InitSessionOptions = {},
): Promise<LoginOutcome> {
  const client = await createOAuthClient(appserverDid, opts);
  // Forward `state` so the app can round-trip a return URL through the PDS.
  // The value comes back unchanged via the `state` field of the result.
  const tauri = window.__TAURI__;
  if (!tauri) {
    await client.signIn(handle, opts.state ? { state: opts.state } : undefined);
    return { failure: "invalid" }; // unreachable — the browser has navigated to the PDS
  }

  // Race the whole Tauri flow (opener IPC, deep-link wait, callback) against
  // a timeout so an abandoned login ALWAYS resolves, letting the caller
  // revert its loading state and surface the expiry. `waitForDeepLink` alone
  // can't guarantee this: the opener IPC promise or the deep-link listener
  // could in theory never settle, and the flow must not hang on them.
  const timeoutMs = opts.loginTimeoutMs ?? 10 * 60_000;
  const outcome = await withTimeout(tauriLogin(client, handle, opts, tauri), timeoutMs);
  return outcome ?? { failure: "timeout" };
}

async function tauriLogin(
  client: BrowserOAuthClient,
  handle: string,
  opts: InitSessionOptions,
  tauri: NonNullable<Window["__TAURI__"]>,
): Promise<LoginOutcome> {
  const url = await client.authorize(handle, opts.state ? { state: opts.state } : undefined);

  // Fire-and-forget: `openUrl`'s IPC promise may never settle on some
  // platforms, and we only need the system browser to have launched to start
  // waiting for the deep link.
  void tauri.opener.openUrl(url).catch(() => {});

  const deepUrl = await waitForDeepLink(tauri.deepLink);
  if (!deepUrl) return { failure: "timeout" };

  const params = new URLSearchParams(new URL(deepUrl).search);
  if (!params.has("state")) return { failure: "invalid" };

  const cbResult = await client.initCallback(params, client.clientMetadata.redirect_uris[0]);
  if (!cbResult?.session) return { failure: "invalid" };
  return {
    session: cbResult.session,
    agent: new Agent(cbResult.session as any),
    state: cbResult.state,
  };
}

/**
 * Sign out and clear all stored session state.
 */
export async function logout(session: OAuthSession): Promise<void> {
  await session.signOut();
  sessionStorage.clear();
}
