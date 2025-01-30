import type { Agent } from "@atproto/api";
import type { AutodocStorageInterface } from "./autodoc.svelte";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";

export class PdsStorageAdapter implements AutodocStorageInterface {
  agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  static buildKey(path: string[]): string {
    if (path.some((x) => x.includes("\0")))
      throw "Strings may not contain null bytes.";
    return btoa(path.join("\0"));
  }

  static parseKey(key: string): string[] {
    return atob(key).split("\0");
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
        const uriSplit = record.uri.split("/");
        const rkey = uriSplit[uriSplit.length - 1];
        const key = PdsStorageAdapter.parseKey(rkey);

        let prefixMatches = true;
        for (let i = 0; i < prefix.length; i++) {
          if (prefix[i] != key[i]) {
            prefixMatches = false;
            break;
          }
        }
        if (prefixMatches) {
          yield {
            blobCid: (record.value as any).data.ref,
            key,
          };
        }
      }
    } while (cursor);
  }

  async load(key: string[]): Promise<Uint8Array | undefined> {
    const resp = await this.agent.com.atproto.repo.getRecord({
      collection: "town.muni.roomy.v0.store",
      repo: this.agent.assertDid,
      rkey: PdsStorageAdapter.buildKey(key),
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
      rkey: PdsStorageAdapter.buildKey(key),
      record: {
        data: resp.data.blob,
      },
    });
    if (!putResp.success) throw `Error putting store record to PDS: ${resp}`;
  }
  async remove(key: string[]): Promise<void> {
    const resp = await this.agent.com.atproto.repo.deleteRecord({
      collection: "town.muni.roomy.v0.store",
      repo: this.agent.assertDid,
      rkey: PdsStorageAdapter.buildKey(key),
    });
    if (!resp.success)
      throw `Error deleting record from PDS ( \`${key}\` ): ${resp}`;
  }
  async loadRange(
    key: string[],
  ): Promise<{ key: string[]; data: Uint8Array | undefined }[]> {
    const records: { key: string[]; data: Uint8Array | undefined }[] = [];
    for await (const record of PdsStorageAdapter.listRecords(this.agent, key)) {
      const resp = await this.agent.com.atproto.sync.getBlob({
        cid: record.blobCid,
        did: this.agent.assertDid,
      });
      if (!resp.success) console.warn("Error downloading blob", resp);
      records.push({
        key,
        data: resp.success ? new Uint8Array(resp.data.buffer) : undefined,
      });
    }
    return records;
  }
  async removeRange(key: string[]): Promise<void> {
    for await (const record of PdsStorageAdapter.listRecords(this.agent, key)) {
      const resp = await this.agent.com.atproto.repo.deleteRecord({
        repo: this.agent.assertDid,
        collection: "town.muni.roomy.v0.store",
        rkey: PdsStorageAdapter.buildKey(record.key),
      });
      if (!resp.success) console.warn("Error deleting record", resp.data);
    }
  }
}

export class LocalAndPdsStorageAdapter implements AutodocStorageInterface {
  agent: Agent;
  local: AutodocStorageInterface;

  constructor(storeName: string, agent: Agent) {
    this.agent = agent;
    this.local = new IndexedDBStorageAdapter(agent.assertDid, storeName);
  }
  load(key: string[]): Promise<Uint8Array | undefined> {
    throw new Error("Method not implemented.");
  }
  save(key: string[], data: Uint8Array): Promise<void> {
    throw new Error("Method not implemented.");
  }
  remove(key: string[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  loadRange(
    key: string[],
  ): Promise<{ key: string[]; data: Uint8Array | undefined }[]> {
    throw new Error("Method not implemented.");
  }
  removeRange(key: string[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
