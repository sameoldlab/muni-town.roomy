/**
 * Arbiter server configuration.
 *
 * The arbiter (leaf-0.4) is the service that provisions real ATProto accounts
 * for new Roomy spaces. The appserver calls it to create a stewarded account
 * (which comes with a real PDS repo), installs a policy, and proxies the
 * `space.roomy.service/self` record write under the new account.
 *
 * Env vars:
 * - `ARBITER_URL` — base HTTP origin of the arbiter server (required to enable)
 * - `ARBITER_DID` — the arbiter server's own DID (the `aud` of serviceAuth
 *   tokens). For a `did:web` with a non-default port the port is
 *   percent-encoded in the DID (`did:web:localhost%3A8203`).
 */

export interface ArbiterConfig {
  /** Base HTTP origin (no trailing slash), e.g. `https://arbiter.roomy.chat`. */
  url: string;
  /** The arbiter server's own DID (the `aud` of serviceAuth tokens). */
  did: string;
}

/**
 * Parse arbiter configuration from environment variables.
 *
 * Reads `ARBITER_URL` and `ARBITER_DID`. Returns `null` when either is
 * missing — callers treat this as "arbiter not configured" (space creation
 * fails closed rather than falling back to self-provisioned DIDs).
 */
export function getArbiterConfig(): ArbiterConfig | null {
  const url = process.env.ARBITER_URL;
  const did = process.env.ARBITER_DID;
  if (!url || !did) return null;
  return { url: url.replace(/\/+$/, ""), did };
}
