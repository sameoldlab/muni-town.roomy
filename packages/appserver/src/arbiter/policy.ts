/**
 * Default Rego policy installed on every newly-created space arbiter.
 *
 * The policy gates what the arbiter will proxy under the space's account.
 * For now we allow only the appserver (the recovery admin / owner) to act on
 * the space DID — the space itself is always allowed, and everything else is
 * denied.
 *
 * `${owner}` is substituted with the appserver's own DID at install time.
 */
export const DEFAULT_ARBITER_POLICY = `package arbiter

import rego.v1

# By default we deny every request.
default result := {"ok": false, "error": {"status": 403, "error": "ErrPermissionDenied"}}

# Allowed requests are proxied to the steward's PDS as the stewarded account.
result := xrpc({
   "did": concat("#", [input.arbiterDid, "atproto_pds"]),
   "method": input.method,
   "nsid": input.nsid,
   "parameters": input.parameters,
   "body": input.body,
   "encoding": input.encoding,
}) if allow

# The stewarded account itself is always allowed.
allow if input.callerDid == input.arbiterDid

# The owner (the appserver) is always allowed.
allow if input.callerDid == "\${owner}"

default allow := false
`;
