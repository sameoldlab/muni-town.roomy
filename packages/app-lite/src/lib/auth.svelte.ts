import { Agent, AtpAgent } from "@atproto/api";
import { BrowserOAuthClient } from "@atproto/oauth-client-browser";
import {
  initSession,
  login as sdkLogin,
  logout as sdkLogout,
  saveAppserverDid,
  type OAuthSession,
} from "@roomy-space/sdk/browser";
import { transport } from "@roomy-space/sdk";
import { goto } from "$app/navigation";
import { CONFIG, OAUTH_SCOPE } from "./config";
import { scheduleAutoReload } from "./error-recovery";
import { setAppserverOrigin } from "./appserver-origin";
import { subscribeIfAlreadyPermitted, clearPushSubscription } from "./push.svelte";
import { page } from "$app/state";

const { ServiceAuthClient, DirectXrpcClient, resolveAppserverHttpOrigin } = transport;

let agent = $state<Agent | null>(null);
let session = $state<OAuthSession | null>(null);
/** When set, `agent` is an AtpAgent logged in via app password (test mode). */
let appPasswordAgent = $state<AtpAgent | null>(null);
let authenticated = $state(false);
let initializing = $state(true);
let initError = $state<string | null>(null);
export function isAuthenticated(): boolean {
  return authenticated;
}
export function isInitializing(): boolean {
  return initializing;
}

/** Cached profile for the current session, set reactively after login. */
let profile = $state<{ handle: string; did: string; avatar: string; displayName?: string } | null>(null);

// Direct XRPC client (replaces the proxied agent pattern).
// Created lazily once the agent is available.
let serviceAuth: InstanceType<typeof ServiceAuthClient> | null = null;
let directXrpc: InstanceType<typeof DirectXrpcClient> | null = null;

export const auth = {
  get agent() {
    return agent;
  },
  get session() {
    return session;
  },
  /**
   * The authenticated user's DID. Works for both OAuth and app-password auth
   * (OAuth exposes `session.did`; app-password only has `agent.did`).
   */
  get userDid() {
    return session?.did ?? agent?.did ?? undefined;
  },
  get authenticated() {
    return authenticated;
  },
  /** True while `init()` is in progress (session restoration / OAuth callback). */
  get initializing() {
    return initializing;
  },
  get initError() {
    return initError;
  },
  /** Reactive profile for the current session (handle + DID + avatar). */
  get profile() {
    return profile;
  },
};

/**
 * The current page location (path + query + hash), suitable for round-tripping
 * through the OAuth `state` parameter so we can send the user back where they
 * were after the PDS callback.
 */
function currentReturnUrl(): string {
  return location.pathname + location.search + location.hash;
}

/**
 * Validate a value returned from the OAuth `state` parameter before treating
 * it as a navigation target. `state` is opaque to the PDS and returned verbatim,
 * so under normal flow it is exactly what we sent in `login()`. But a crafted
 * callback URL could inject an arbitrary `state`, so only accept same-origin,
 * path-relative targets (must start with a single `/`). This prevents an
 * open-redirect via a malicious `state` like `https://evil.example` or
 * `//evil.example`.
 */
function safeReturnUrl(state: unknown): string | null {
  if (typeof state !== "string" || state.length === 0) return null;
  // Must be a root-relative path; reject protocol-relative (`//`) and absolute URLs.
  if (state[0] !== "/" || state[1] === "/") return null;
  return state;
}

/**
 * Wire up the ServiceAuthClient + DirectXrpcClient for an authenticated agent.
 * Shared by the OAuth path (init) and the app-password path (loginWithAppPassword).
 */
async function setupDirectXrpc(authAgent: Agent) {
  serviceAuth = new ServiceAuthClient(authAgent);
  // Local dev: when an HTTP origin override is set (derived from
  // VITE_APPSERVER_WS_ORIGIN), send XRPC to the local appserver instead of
  // resolving the DID to production. Keeps queries/procedures and the sync
  // WS pointed at the same local server.
  const appserverUrl =
    CONFIG.appserverHttpOrigin ??
    (await resolveAppserverHttpOrigin(CONFIG.appserverDid));
  setAppserverOrigin(appserverUrl);
  directXrpc = new DirectXrpcClient(appserverUrl, CONFIG.appserverDid, serviceAuth);
}

/**
 * Authenticate via ATProto app password (test mode). Creates an AtpAgent,
 * logs in, and wires up the same ServiceAuthClient + DirectXrpcClient as the
 * OAuth path. Used when PUBLIC_TEST_IDENTIFIER + PUBLIC_TEST_APP_PASSWORD are
 * set in the build env, enabling headless E2E testing without the OAuth
 * round-trip (which requires a publicly-exposed redirect URI).
 */
async function loginWithAppPassword(identifier: string, password: string) {
  const atpAgent = new AtpAgent({ service: "https://bsky.social" });
  await atpAgent.login({ identifier, password });
  if (!atpAgent.did) throw new Error("App password login failed — no DID");

  appPasswordAgent = atpAgent;
  agent = atpAgent;
  await setupDirectXrpc(atpAgent);
  authenticated = true;
}

export async function init() {
  try {
    saveAppserverDid(CONFIG.appserverDid);

    // Test mode: if app-password credentials are baked into the build env,
    // auto-login via app password instead of attempting OAuth session restore.
    // This bypasses the OAuth round-trip entirely, enabling headless E2E
    // testing against a local appserver without a publicly-exposed redirect.
    if (CONFIG.testIdentifier && CONFIG.testAppPassword) {
      await loginWithAppPassword(CONFIG.testIdentifier, CONFIG.testAppPassword);
      // Re-register this device's push subscription in case the browser
      // rotated the endpoint (Chrome/FCM does this periodically). No-op if
      // push is unsupported/unconfigured or permission was never granted.
      void subscribeIfAlreadyPermitted();
      return;
    }
    console.log({ CONFIG })
    if ('__TAURI__' in window) {
      // OAuth callback fallback for Tauri / native environments where the
      // current origin doesn't match any registered redirect URI:
      //   BrowserOAuthClient.init() → readCallbackParams() finds params
      //   → findRedirectUrl() mismatches → falls to initRestore() → null.
      const params = new URLSearchParams(location.search);
      if (params.has('state') && (params.has('code') || params.has('error'))) {
        const nativeClient = new BrowserOAuthClient({
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
          responseMode: 'query',
          handleResolver: 'https://bsky.social',
        });
        const cbResult = await nativeClient.initCallback(params, 'space.roomy:/');
        session = cbResult.session;
        agent = new Agent(cbResult.session);
        await setupDirectXrpc(agent);
        authenticated = true;

        const returnUrl = safeReturnUrl(cbResult.state);
        if (returnUrl && returnUrl !== currentReturnUrl()) {
          goto(returnUrl, { replaceState: true });
        }

        void subscribeIfAlreadyPermitted();
      }
    } else {
      const result = await initSession(CONFIG.appserverDid, {
        port: CONFIG.port,
        scope: OAUTH_SCOPE,
        usePublicClient: CONFIG.usePublicClient,
      });
      console.log({ result, url: page.url })
      if (result) {
        session = result.session;
        agent = result.agent;
        await setupDirectXrpc(result.agent);
        authenticated = true;

        // After an OAuth callback the browser lands on the fixed redirect URI
        // (the homepage). If we round-tripped the original URL through the
        // `state` parameter in `login()`, navigate back to it now. On a plain
        // session restore (reload) `result.state` is undefined, so we stay put.
        const returnUrl = safeReturnUrl(result.state);
        if (returnUrl && returnUrl !== currentReturnUrl()) {
          goto(returnUrl, { replaceState: true });
        }
        // Re-register this device's push subscription in case the browser
        // rotated the endpoint (Chrome/FCM does this periodically). No-op if
        // push is unsupported/unconfigured or permission was never granted.
        void subscribeIfAlreadyPermitted();

      }
    }
  } catch (err) {
    initError = String(err);
    // If session restoration failed due to a recoverable ATProto auth error
    // (expired/revoked token, failed refresh), auto-reload to retry init —
    // this is the primary recovery path in the PWA where manual reload is
    // impossible. scheduleAutoReload no-ops for non-recoverable errors, so
    // genuine config/DNS failures simply surface as initError instead.
    scheduleAutoReload(err);
  } finally {
    initializing = false;
  }
}

export async function login(handle: string) {
  saveAppserverDid(CONFIG.appserverDid);
  // Remember the page the user was on so `init()` can send them back here
  // after the PDS redirects to the fixed OAuth redirect URI (the homepage).
  const returnUrl = currentReturnUrl();
  console.log({ returnUrl })
  const res = await sdkLogin(CONFIG.appserverDid, handle, {
    port: CONFIG.port,
    scope: OAUTH_SCOPE,
    usePublicClient: CONFIG.usePublicClient,
    state: returnUrl,
  });
  console.log({ res })
}

/**
 * Fetch the user's Roomy profile from the appserver and update the reactive
 * `auth.profile` state + localStorage cache. Call this immediately on
 * login/init.
 *
 * Uses the appserver's `space.roomy.user.getProfile` XRPC (Roomy-first with
 * Bluesky fallback) instead of calling the Bluesky appview directly. This
 * keeps the profile source consistent: the appserver materializes the
 * `space.roomy.user.profile/self` PDS record, falling back to the Bluesky
 * appview when no Roomy record exists.
 */
export async function updateProfile() {
  const did = session?.did ?? agent?.did;
  if (!did) return;
  try {
    const res = await px().query("space.roomy.user.getProfile", { actor: did });
    const p = {
      handle: res.handle ?? "",
      did,
      avatar: res.avatar ?? "",
      displayName: res.displayName || undefined,
    };
    profile = p;
    localStorage.setItem("last-login", JSON.stringify(p));
  } catch (e) {
    console.warn("Failed to fetch profile:", e);
  }
}

export async function logout() {
  // Stop delivering push to this device while signed out. Best-effort: a
  // failure here must not block logout. clearPushSubscription returns an
  // outcome (never throws) — just log on non-ok.
  const pushOutcome = await clearPushSubscription();
  if (pushOutcome.status !== "ok" && pushOutcome.status !== "unsupported") {
    console.warn("[push] clear on logout failed:", pushOutcome.status);
  }
  if (appPasswordAgent) {
    await appPasswordAgent.logout();
  } else if (session) {
    await sdkLogout(session);
  }
  serviceAuth?.clear();
  serviceAuth = null;
  directXrpc = null;
  authenticated = false;
  agent = null;
  session = null;
  appPasswordAgent = null;
  profile = null;
  location.reload();
}

/**
 * Get the XRPC client for making typed calls to the appserver.
 *
 * Makes direct HTTP requests to the appserver using short-lived service
 * auth tokens obtained from `com.atproto.server.getServiceAuth`. Token
 * caching and auto-refresh are handled transparently.
 *
 * Throws if the user is not authenticated.
 */
export function px(): InstanceType<typeof DirectXrpcClient> {
  if (!directXrpc) throw new Error("Not authenticated");
  return directXrpc;
}