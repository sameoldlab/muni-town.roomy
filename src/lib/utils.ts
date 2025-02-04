import type { DidDocument } from "@atproto/oauth-client-browser";
import type { Doc } from "@automerge/automerge";
import * as Automerge from "@automerge/automerge";
import { decodeBase32 } from "./base32";

const handleCache: { [did: string]: DidDocument } = {};

export async function resolveDid(
  did: string,
): Promise<DidDocument | undefined> {
  if (handleCache[did]) return handleCache[did];
  try {
    const resp = await fetch(`https://plc.directory/${did}`);
    const json = await resp.json();
    return json;
  } catch (_e) {
    // Ignore error
  }
}

const keyCache: { [did: string]: Uint8Array } = {};
export async function resolvePublicKey(did: string): Promise<Uint8Array> {
  const resp = await fetch(
    `https://keyserver.roomy.chat/xrpc/chat.roomy.v0.key.public?did=${encodeURIComponent(did)}`,
  );
  const json = await resp.json();
  keyCache[did] = json.publicKey;
  return decodeBase32(json.publicKey);
}

export function unreadCount<Channel>(
  doc: Doc<Channel>,
  viewedHeads: Automerge.Heads,
): number {
  let count = 0;
  const patches = Automerge.diff(doc, viewedHeads, Automerge.getHeads(doc));
  for (const patch of patches) {
    if (
      patch.action == "put" &&
      patch.path.length == 2 &&
      patch.path[0] == "messages"
    ) {
      count += 1;
    }
  }
  return count;
}
