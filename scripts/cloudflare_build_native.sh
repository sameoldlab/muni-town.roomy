#!/bin/env bash

set -ex

# Install deno
curl -fsSL https://deno.land/install.sh | sh
deno="$HOME/.deno/bin/deno"

# Install dependencies
$deno install --allow-scripts
$deno run build

# Add oauth-client configuration
echo '{
  "client_id": "https://roomy-tauri.cloudflare-94f.workers.dev/oauth-client.json",
  "client_name": "Roomy",
  "client_uri": "https://roomy-tauri.cloudflare-94f.workers.dev",
  "logo_uri": "https://roomy-tauri.cloudflare-94f.workers.dev/favicon.png",
  "tos_uri": "https://roomy-tauri.cloudflare-94f.workers.dev",
  "policy_uri": "https://roomy-tauri.cloudflare-94f.workers.dev",
  "redirect_uris": ["dev.workers.cloudflare-94f.roomy-tauri:/oauth/callback"],
  "scope": "atproto transition:generic transition:chat.bsky",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "native",
  "dpop_bound_access_tokens": true
}' > dist/oauth-client.json
