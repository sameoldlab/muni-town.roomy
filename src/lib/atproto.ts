import { dev } from "$app/environment";
import {
  atprotoLoopbackClientMetadata,
  BrowserOAuthClient,
  buildLoopbackClientId,
  type OAuthClientMetadataInput,
} from "@atproto/oauth-client-browser";

export const scope = "atproto transition:generic transition:chat.bsky";
export let atprotoClient: BrowserOAuthClient;

export async function initAtprotoClient() {
  if (atprotoClient) return;

  const baseUrl = new URL(
    dev ? "http://127.0.0.1:5173" : globalThis.location.href,
  );
  baseUrl.hash = "";
  baseUrl.pathname = "/";

  let clientMetadata: OAuthClientMetadataInput;
  const redirectUri = baseUrl.href + "oauth/callback";
  if (dev) {
    clientMetadata = {
      ...atprotoLoopbackClientMetadata(buildLoopbackClientId(baseUrl)),
      redirect_uris: [redirectUri],
      scope,
      client_id: `http://localhost?redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&scope=${encodeURIComponent(scope)}`,
    };
  } else {
    const resp = await fetch("/oauth-client.json", {
      headers: [["accept", "application/json"]],
    });
    clientMetadata = await resp.json();
  }

  atprotoClient = new BrowserOAuthClient({
    responseMode: "query",
    handleResolver: "https://bsky.social",
    clientMetadata,
  });
}
