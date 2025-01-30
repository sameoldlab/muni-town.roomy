import type { Doc } from "@automerge/automerge";
import * as Automerge from "@automerge/automerge";
import { encodeBase32 } from "./base32";

export interface AutodocSyncChannel {}

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

  firstLoad = $state(true);
  loadedChunks: ChunkInfo[] = [];
  loadedHeads: Automerge.next.Heads = [];

  constructor({ init, storage, sync }: AutodocInit) {
    this.view = Automerge.load(init);
    this.storage = storage;
    this.sync = sync;

    const cleanupStorageTask = this.startStorage();
    const cleanupSyncTask = this.startSync();
    garbageCollector.register(this, [cleanupStorageTask, cleanupSyncTask]);
  }

  change(changer: Automerge.ChangeFn<T>) {
    this.view = Automerge.change(this.view, changer);
  }

  merge(other: Doc<T>) {
    this.view = Automerge.merge(this.view, other);
  }

  heads(): Automerge.next.Heads {
    return Automerge.getHeads(this.view);
  }

  export(): Uint8Array {
    return Automerge.save(this.view);
  }

  loadIncremental(data: Uint8Array) {
    this.view = Automerge.loadIncremental(this.view, data);
  }

  async saveToStorage() {
    if (!this.storage) throw "Cannot save to storage: storage adapter not set.";

    // NOTE: copying the loaded chunks, immediately at the time of triggering the save, is very
    // important to make sure that a concurrent call to loadFromStorage doesn't change the loaded
    // chunks and cause us to delete chunks that we have just loaded and not included in the data
    // being saved in this function.
    let toDelete = [...this.loadedChunks];

    const heads = this.heads();
    const needsSave =
      Automerge.diff(this.view, this.loadedHeads, heads).length > 0;

    if (!needsSave) {
      return;
    }

    const binary = this.export();
    const hash = await sha256Base32(binary);

    toDelete = toDelete.filter((x) => x.hash !== hash);

    await this.storage.save(["data", "snapshot", hash], binary);

    for (const chunk of toDelete) {
      await this.storage!.remove(["data", chunk.kind, chunk.hash]);
    }
    this.loadedChunks = [
      {
        hash,
        kind: "snapshot",
        size: binary.length,
      },
    ];
  }

  async loadFromStorage() {
    if (!this.storage) return;

    // Load chunks from storage
    const chunks: Chunk[] = (await this.storage.loadRange(["data"]))
      .filter((x) => !!x.data)
      .map(({ key, data }) => {
        return {
          kind: key[key.length - 2] == "snapshot" ? "snapshot" : "incremental",
          hash: key[key.length - 1],
          size: data!.length,
          data: data!,
        };
      });
    // Concatenate the fragments
    let binary = concat(chunks.map((x) => x.data));

    // Load the data into our doc
    this.loadIncremental(binary);

    // Update loaded chunks & heads
    this.loadedChunks = chunks.map((x) => ({ ...x, data: undefined }));
    this.loadedHeads = this.heads();

    this.firstLoad = false;
  }

  startStorage(): () => void {
    if (!this.storage) return () => {};

    // Spawn a task to load doc from storage
    this.loadFromStorage();

    // NOTE: It is very important that we pass a weak ref into this effect so that it doesn't
    // prevent garbage collection of `this` because it still exists in the effect callback.
    const weakThis = new WeakRef(this);
    const cleanupEffect = $effect.root(() => {
      $effect(() => {
        const self = weakThis.deref();
        if (self && self.view && !self.firstLoad) {
          // Save to storage when the document changes
          self.saveToStorage();
        }
      });
    });

    return cleanupEffect;
  }

  startSync(): () => void {
    if (!this.sync) return () => {};
    // NOTE: It is very important that we pass a weak ref into this effect so that it doesn't
    // prevent garbage collection of `this` because it still exists in the effect callback.
    const weakThis = new WeakRef(this);
    const cleanupEffect = $effect.root(() => {
      const self = weakThis.deref();
      if (self) {
      }
    });

    return cleanupEffect;
  }
}
