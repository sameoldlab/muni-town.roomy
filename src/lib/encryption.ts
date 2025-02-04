import {
  x25519,
  edwardsToMontgomeryPub,
  edwardsToMontgomeryPriv,
} from "@noble/curves/ed25519";
import nacl from "tweetnacl";
import { resolvePublicKey } from "./utils";

export async function getSharedSecret(
  myPrivateKey: Uint8Array,
  theirDid: string,
): Promise<Uint8Array> {
  const theirPublicKey = await resolvePublicKey(theirDid);
  return calculateSharedSecretEd25519(myPrivateKey, theirPublicKey);
}

/** Calculate a shared secret between ed25519 keypairs. */
export function calculateSharedSecretEd25519(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  const myPrivateKeyX = edwardsToMontgomeryPriv(myPrivateKey);
  const theirPublicKeyX = edwardsToMontgomeryPub(theirPublicKey);
  return x25519.getSharedSecret(myPrivateKeyX, theirPublicKeyX);
}

export function decrypt(
  encryptionKey: Uint8Array,
  encrypted: Uint8Array,
): Uint8Array {
  const nonce = encrypted.slice(0, nacl.secretbox.nonceLength);
  const data = encrypted.slice(nacl.secretbox.nonceLength);
  const out = nacl.secretbox.open(data, nonce, encryptionKey);
  if (!out) throw "Could not decrypt data";
  return out;
}

export function encrypt(
  encryptionKey: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(data, nonce, encryptionKey);
  const out = new Uint8Array(nonce.length + encrypted.length);
  out.set(nonce, 0);
  out.set(encrypted, nonce.length);
  return out;
}
