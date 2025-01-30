import type { Doc } from "@automerge/automerge";
import * as Automerge from "@automerge/automerge";
import { encodeBase32 } from "./base32";

export interface AutodocSyncChannel {}

/** Takes a storage adapter and creates a sub-adapter by with the given namespace. */
export function namespacedSubstorage(
  storage: AutodocStorageInterface,
  name: string,
): AutodocStorageInterface {
  return {
    load(key) {
      return storage.load([name, ...key]);
    },
    async loadRange(key) {
      return (await storage.loadRange([name, ...key])).map((x) => ({
        key: x.key.slice(1),
        data: x.data,
      }));
    },
    remove(key) {
      return storage.remove([name, ...key]);
    },
    removeRange(key) {
      return storage.removeRange([name, ...key]);
    },
    save(key, value) {
      return storage.save([name, ...key], value);
    },
  };
}

/** Concatenate Uint8Arrays */
function concat(uint8arrays: Uint8Array[]) {
  const totalLength = uint8arrays.reduce(
    (total, uint8array) => total + uint8array.byteLength,
    0,
  );
  const result = new Uint8Array(totalLength);
  let offset = 0;
  uint8arrays.forEach((uint8array) => {
    result.set(uint8array, offset);
    offset += uint8array.byteLength;
  });
  return result;
}

/** Get the sha256 hash of the given data. */
async function sha256Base32(data: Uint8Array): Promise<string> {
  return encodeBase32(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
  );
}

type StorageKey = string[];
export interface AutodocStorageInterface {
  load(key: StorageKey): Promise<Uint8Array | undefined>;
  save(key: StorageKey, data: Uint8Array): Promise<void>;
  remove(key: StorageKey): Promise<void>;
  loadRange(
    key: StorageKey,
  ): Promise<{ key: StorageKey; data: Uint8Array | undefined }[]>;
  removeRange(key: StorageKey): Promise<void>;
}
type ChunkInfo = {
  kind: "snapshot" | "incremental";
  hash: string;
  size: number;
};
type Chunk = { data: Uint8Array } & ChunkInfo;

const garbageCollector = new FinalizationRegistry(
  (callbacks: (() => void)[]) => {
    console.log("Garbage collecting an autodoc");
    for (const callback of callbacks) {
      callback();
    }
  },
);

type AutodocInit = {
  /** An exported automerge document to use as the initializer for the document. */
  init: Uint8Array;
  /** The storage */
  storage?: AutodocStorageInterface;
  sync?: AutodocSyncChannel;
};

export class Autodoc<T> {
  view: Doc<T> = $state.raw() as Doc<T>; // Lie to the type system since we set this in the constructor;
  storage?: AutodocStorageInterface;
  sync?: AutodocSyncChannel;

  loadedChunks: ChunkInfo[] = [];

  constructor({ init, storage, sync }: AutodocInit) {
    this.view = Automerge.load(init);
    this.storage = storage;
    this.sync = sync;
    const cleanupStorageTask = this.startStorage();
    const cleanupSyncTask = this.startSync();
    garbageCollector.register(this, [cleanupStorageTask, cleanupSyncTask]);
  }

  change = (changer: Automerge.ChangeFn<T>) => {
    this.view = Automerge.change(this.view, changer);
  };

  merge = (other: Doc<T>) => {
    this.view = Automerge.merge(this.view, other);
  };

  export = (): Uint8Array => {
    return Automerge.save(this.view);
  };

  loadIncremental = (data: Uint8Array) => {
    this.view = Automerge.loadIncremental(this.view, data);
  };

  saveToStorage = async () => {
    if (!this.storage) throw "Cannot save to storage: storage adapter not set.";
    const binary = this.export();
    const hash = await sha256Base32(binary);
    await this.storage.save(["data", "snapshot", hash], binary);
    await Promise.all(
      this.loadedChunks.map(async (chunk) => {
        await this.storage!.remove(["data", chunk.kind, chunk.hash]);
      }),
    );
    this.loadedChunks = [
      {
        hash,
        kind: "snapshot",
        size: binary.length,
      },
    ];
  };

  startStorage = (): (() => void) => {
    if (!this.storage) return () => {};

    const cleanupEffect = $effect.root(() => {
      $effect(() => {
        // Save to storage when the document changes
        this.saveToStorage();
      });
    });

    // Spawn a task to load doc from storage
    (async () => {
      if (!this.storage) return;

      // Load chunks from storage
      const chunks: Chunk[] = (await this.storage.loadRange(["data"]))
        .filter((x) => !!x.data)
        .map(({ key, data }) => ({
          kind: key[key.length - 2] == "snapshot" ? "snapshot" : "incremental",
          hash: key[key.length - 1],
          size: data!.length,
          data: data!,
        }));
      // Concatenate the fragments
      let binary = concat(chunks.map((x) => x.data));

      // Load the data into our doc
      this.loadIncremental(binary);

      // Update loaded chunks
      this.loadedChunks = chunks.map((x) => ({ ...x, data: undefined }));
    })();

    return cleanupEffect;
  };

  startSync = (): (() => void) => {
    if (!this.sync) return () => {};
    const cleanupEffect = $effect.root(() => {});

    return cleanupEffect;
  };
}
