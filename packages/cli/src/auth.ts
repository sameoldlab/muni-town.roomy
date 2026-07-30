import { AtpAgent, type Agent } from "@atproto/api";
import { transport } from "@roomy-space/sdk";
import type { Config } from "./config.js";

const { ServiceAuthClient, DirectXrpcClient: DirectXrpcClientClass } = transport;
type DirectXrpcClient = InstanceType<typeof DirectXrpcClientClass>;

export interface AuthState {
  agent: Agent;
  xrpc: DirectXrpcClient;
}

/**
 * Authenticate via ATProto app password and wire up a DirectXrpcClient.
 *
 * Uses the same pattern as app-lite's test-mode auth:
 * 1. Login to bsky.social with identifier + app password
 * 2. Create ServiceAuthClient for token management
 * 3. Create DirectXrpcClient pointed at the appserver
 */
export async function authenticate(config: Config): Promise<AuthState> {
  if (!config.identifier || !config.appPassword) {
    throw new Error(
      "Authentication required. Set ATPROTO_IDENTIFIER and ATPROTO_APP_PASSWORD environment variables.",
    );
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: config.identifier, password: config.appPassword });
  if (!agent.did) throw new Error("Login failed — no DID returned");

  const serviceAuth = new ServiceAuthClient(agent);
  const xrpc = new DirectXrpcClientClass(
    config.appserverUrl,
    config.appserverDid,
    serviceAuth,
  );

  return { agent, xrpc };
}
