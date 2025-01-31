import type { Agent } from "@atproto/api";
import type { AutodocStorageInterface } from "./autodoc.svelte";
import * as base64 from "js-base64";

/** Takes a storage adapter and creates a sub-adapter by with the given namespace. */
export function namespacedSubstorage(
  storage: AutodocStorageInterface,
  ...namespaces: string[]
): AutodocStorageInterface {
  return {
    load(key) {
      return storage.load([...namespaces, ...key]);
    },
    async loadRange(key) {
      const result = await storage.loadRange([...namespaces, ...key]);
      return result.map((x) => ({
        key: x.key.slice(namespaces.length),
        data: x.data,
      }));
    },
    remove(key) {
      return storage.remove([...namespaces, ...key]);
    },
    removeRange(key) {
      return storage.removeRange([...namespaces, ...key]);
    },
    save(key, value) {
      return storage.save([...namespaces, ...key], value);
    },
  };
}

export class RoomyPdsStorageAdapter implements AutodocStorageInterface {
  agent: Agent;

  static async buildKey(key: string[]): Promise<string> {
    if (key.some((x) => x.includes("\0")))
      throw "Cannot encode paths containing null bytes";
    const data = new Uint8Array(new TextEncoder().encode(key.join("\0")));
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(data)),
    );
    return base64.fromUint8Array(hash, true);
  }

  constructor(agent: Agent) {
    this.agent = agent;
  }

  static async *listRecords(
    agent: Agent,
    prefix: string[],
  ): AsyncIterable<{ key: string[]; blobCid: string }> {
    let cursor: string | undefined;
    do {
      const resp = await agent.com.atproto.repo.listRecords({
        collection: "town.muni.roomy.v0.store",
        repo: agent.assertDid,
        cursor,
        limit: 100,
      });
      if (!resp.success) throw `Error listing records from PDS: ${resp}`;

      cursor = resp.data.cursor;

      for (const record of resp.data.records) {
        const rdata = record.value as {
          key: string[];
          data: { ref: { toString(): string } };
        };
        let prefixMatches = true;
        for (let i = 0; i < prefix.length; i++) {
          if (prefix[i] != rdata.key[i]) {
            prefixMatches = false;
            break;
          }
        }
        if (prefixMatches) {
          yield {
            blobCid: rdata.data.ref.toString(),
            key: rdata.key,
          };
        }
      }
    } while (cursor);
  }

  async load(key: string[]): Promise<Uint8Array | undefined> {
    const resp = await this.agent.com.atproto.repo.getRecord({
      collection: "town.muni.roomy.v0.store",
      repo: this.agent.assertDid,
      rkey: await RoomyPdsStorageAdapter.buildKey(key),
    });
    if (!resp.success) return undefined;
    const blob = await this.agent.com.atproto.sync.getBlob({
      cid: resp.data.ref!.toString(),
      did: this.agent.assertDid,
    });
    if (!blob.success) return undefined;
    return blob.data;
  }
  async save(key: string[], data: Uint8Array): Promise<void> {
    const resp = await this.agent.uploadBlob(data);
    if (!resp.success)
      throw `Error uploading blob to PDS ( \`${key}\` ): ${resp}`;
    const putResp = await this.agent.com.atproto.repo.putRecord({
      collection: "town.muni.roomy.v0.store",
      repo: this.agent.assertDid,
      rkey: await RoomyPdsStorageAdapter.buildKey(key),
      record: {
        key,
        data: resp.data.blob,
      },
    });
    if (!putResp.success) throw `Error putting store record to PDS: ${resp}`;
  }
  async remove(key: string[]): Promise<void> {
    const resp = await this.agent.com.atproto.repo.deleteRecord({
      collection: "town.muni.roomy.v0.store",
      repo: this.agent.assertDid,
      rkey: await RoomyPdsStorageAdapter.buildKey(key),
    });
    if (!resp.success)
      throw `Error deleting record from PDS ( \`${key}\` ): ${resp}`;
  }
  async loadRange(
    key: string[],
  ): Promise<{ key: string[]; data: Uint8Array | undefined }[]> {
    const records: { key: string[]; data: Uint8Array | undefined }[] = [];
    for await (const record of RoomyPdsStorageAdapter.listRecords(
      this.agent,
      key,
    )) {
      const resp = await this.agent.com.atproto.sync.getBlob({
        cid: record.blobCid,
        did: this.agent.assertDid,
      });
      if (!resp.success) console.warn("Error downloading blob", resp);
      records.push({
        key: record.key,
        data: resp.success ? new Uint8Array(resp.data.buffer) : undefined,
      });
    }
    return records;
  }
  async removeRange(key: string[]): Promise<void> {
    for await (const record of RoomyPdsStorageAdapter.listRecords(
      this.agent,
      key,
    )) {
      const resp = await this.agent.com.atproto.repo.deleteRecord({
        repo: this.agent.assertDid,
        collection: "town.muni.roomy.v0.store",
        rkey: await RoomyPdsStorageAdapter.buildKey(record.key),
      });
      if (!resp.success) console.warn("Error deleting record", resp.data);
    }
  }
}
