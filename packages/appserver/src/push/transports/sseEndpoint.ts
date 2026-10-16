/**
 * SSE endpoint identity: `did#clientId`.
 *
 * clientId is opaque identifier the account owner asks for notifications to. 
 * DID must match verified auth token from registration
 *
 * This module imports nothing so the registration handler, the stream route
 * and the transport can depend on it.
 */

const MAX_DID_LENGTH = 2048;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
export function isSseClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value);
}

export interface SseEndpoint {
  userDid: string;
  clientId: string;
}

export function sseEndpoint(userDid: string, clientId: string): string {
  return `${userDid}#${clientId}`;
}

export function parseSseEndpoint(value: string): SseEndpoint | null {
  if (value.length === 0 || value.length > MAX_DID_LENGTH + 65) return null;
  const [userDid, clientId] = value.split('#')
  if (!userDid || !clientId || !(userDid === 'string' &&
    userDid.startsWith('did:') &&
    userDid.indexOf(':', 4) === 4 &&
    userDid.length > 8 &&
    userDid.length <= 2048) || !isSseClientId(clientId)) return null;

  return { userDid, clientId };
}

