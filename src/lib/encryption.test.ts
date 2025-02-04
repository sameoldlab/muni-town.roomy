import { expect, test } from "vitest";
import nacl from "tweetnacl";
import { decrypt, encrypt } from "./encryption";

test("encryption round-trip", () => {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const data = nacl.randomBytes(40);

  expect(decrypt(key, encrypt(key, data))).toStrictEqual(data);
});
