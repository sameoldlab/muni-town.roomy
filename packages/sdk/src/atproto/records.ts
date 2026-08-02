import type { Agent, BlobRef } from "@atproto/api";
import { StreamDid } from "../schema";

export interface StreamHandleConfig {
  collection: string;
}


/** Create a stream handle record linking a user's DID to a space. */
export async function createProfileSpaceRecord(
  agent: Agent,
  spaceId: StreamDid,
  config: StreamHandleConfig,
): Promise<void> {
  const resp = await agent.com.atproto.repo.putRecord(
    {
      collection: config.collection,
      repo: agent.assertDid,
      rkey: "self",
      record: { $type: config.collection, id: spaceId },
    },

    {
      headers: {
        "atproto-proxy": `${agent.assertDid}#atproto_pds`,
      },
    },
  );
  if (!resp.success) throw new Error("Failed to create stream handle record");
}

/** Remove a stream handle record. */
export async function removeProfileSpaceRecord(
  agent: Agent,
  config: StreamHandleConfig,
): Promise<void> {
  const resp = await agent.com.atproto.repo.deleteRecord(
    {
      collection: config.collection,
      repo: agent.assertDid,
      rkey: "self",
    },
    {
      headers: {
        "atproto-proxy": `${agent.assertDid}#atproto_pds`,
      },
    },
  );
  if (!resp.success) throw new Error("Failed to delete stream handle record");
}

/** Upload a blob to the user's PDS. */
export async function uploadBlob(
  agent: Agent,
  bytes: ArrayBuffer,
  opts?: { alt?: string; mimetype?: string },
): Promise<{ blob: ReturnType<BlobRef["toJSON"]>; uri: string }> {
  const resp = await agent.com.atproto.repo.uploadBlob(new Uint8Array(bytes), {
    headers: {
      "atproto-proxy": `${agent.assertDid}#atproto_pds`,
    },
  });
  const blobRef = resp.data.blob;
  if (opts?.mimetype) blobRef.mimeType = opts.mimetype;

  // Create a record linking to the blob
  await agent.com.atproto.repo.putRecord(
    {
      repo: agent.assertDid,
      collection: "space.roomy.upload.v0",
      rkey: `${Date.now()}`,
      record: {
        $type: "space.roomy.upload.v0",
        image: blobRef,
        alt: opts?.alt,
      },
    },
    {
      headers: {
        "atproto-proxy": `${agent.assertDid}#atproto_pds`,
      },
    },
  );

  return {
    blob: blobRef.toJSON(),
    uri: `atblob://${agent.assertDid}/${blobRef.ref}`,
  };
}
