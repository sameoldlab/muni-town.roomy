import { BrowserOAuthClient } from "@atproto/oauth-client-browser";
import { dev } from "$app/environment";

// TODO: change to permanent public URL
const publicUrl = "https://pigeon.muni.town"
// localhost resolves to either 127.0.0.1 or [::1] (if ipv6)
const url = dev ? "http://[::1]:5173" : publicUrl;

export const clientMetadata = {
  client_name: "Pigeon",
  application_type: "web",
  client_id: !dev ? `${publicUrl}/client-metadata.json`
    : `http://localhost?redirect_uri=${
      encodeURIComponent(`${url}/oauth/callback`)
    }&scope=${
      encodeURIComponent(`atproto transition:generic`)
    }`,
  client_uri: url,
  redirect_uris: [`${url}/oauth/callback`], 
  scope: "atproto transition:generic",
  grant_types: ["authorization_code", "refresh_token"],
  token_endpoint_auth_method: "none",
  dpop_bound_access_tokens: true,
  response_types: ["code"]
};

export const atprotoClient = new BrowserOAuthClient({
  clientMetadata,
  handleResolver: 'https://public.api.bsky.app'
} as any);

