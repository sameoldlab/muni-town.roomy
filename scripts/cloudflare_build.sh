#!/bin/env bash

curl -fsSL https://deno.land/install.sh | sh

deno install
deno run build

echo '{
  "client_id": "https://roomy.muni.town/oauth-client.json",
  "client_name": "Roomy",
  "client_uri": "https://roomy.muni.town",
  "logo_uri": "https://roomy.muni.town/public/favicon.ico",
  "tos_uri": "https://roomy.muni.town",
  "policy_uri": "https://roomy.muni.town",
  "redirect_uris": ["https://roomy.muni.town/oauth/callback"],
  "scope": "atproto transition:generic transition:chat.bsky",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web",
  "dpop_bound_access_tokens": true
}' > dist/oauth-client.json
