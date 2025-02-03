const sizeofU16 = 2;

export type SyncDocId = "dm";

/** A message send to the router to sync a specific document. */
export type RouterSyncMessage = {
  docId: SyncDocId;
  data: Uint8Array;
};

export function encodeRouterSyncMsg({
  docId,
  data,
}: RouterSyncMessage): Uint8Array {
  const docIdEncoded = new TextEncoder().encode(JSON.stringify(docId));
  const docIdLen = docIdEncoded.length;
  const out = new Uint8Array(sizeofU16 + docIdLen + data.length);
  new DataView(out.buffer).setUint16(0, docIdLen, true);
  out.set(docIdEncoded, sizeofU16);
  out.set(data, sizeofU16 + docIdLen);
  return out;
}

export function parseRouterSyncMsg(d: Uint8Array): RouterSyncMessage {
  const docIdLen = new DataView(d.buffer).getUint16(0, true);
  const docIdEncoded = d.slice(sizeofU16, sizeofU16 + docIdLen);
  const docIdTxt = new TextDecoder().decode(docIdEncoded);
  const docId = JSON.parse(docIdTxt);
  const data = d.slice(sizeofU16 + docIdLen);
  return { docId, data };
}
