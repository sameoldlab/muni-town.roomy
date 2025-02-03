import type { Doc } from "@automerge/automerge";
import * as Automerge from "@automerge/automerge";
import { encodeBase32 } from "./base32";
import { onDestroy, untrack } from "svelte";
import { createSubscriber } from "svelte/reactivity";

/** The realtime sync interface for `Autodoc`. */
export interface AutodocSyncChannel {
  /** Set a callback that will be called when messages are received. */
  setReceiver(receiver: (msg: Uint8Array) => void): void;
  /** Send a message over the channel. */
  send(msg: Uint8Array): Promise<void>;
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

/** A key in the storage interface. */
type StorageKey = string[];
/** The storage interface for `Autodoc` */
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

type AutodocInit = {
  /** The Autodoc export for the initial state of the document. */
  init: Uint8Array;

  /** The "fast" local storage adapter that will be synced on every update. */
  storage?: AutodocStorageInterface;

  /** The "slow" probably remote storage adapter that will be synced occasionally as a backup and
   * loaded from initially. */
  slowStorage?: AutodocStorageInterface;

  /** How often we should write the current document back to slow storage. */
  slowStorageWriteInterval?: number;

  /** Must be set to true if this is not used in a component, i.e. if it is instantiate in a
   * .svelte.ts file. */
  notInComponent?: boolean;

  /** Callback to run when the document changes. */
  onDocChanged?: () => void;
};

export class Autodoc<T> {
  /** The reactive view of the doc's current state. */
  #view: Doc<T>; // Lie to the type system since we set this in the constructor;

  #subscribe: () => void;
  #updateSubscribers: () => void = () => {};

  onDocChanged?: () => void;

  get view(): Doc<T> {
    this.#subscribe();
    return this.#view;
  }
  set view(value) {
    if (this.onDocChanged) this.onDocChanged();
    this.#updateSubscribers();
    this.#view = value;
  }

  /** The "fast" local storage adapter that will be synced on every update. */
  storage?: StorageManager<T>;

  /** The "slow" probably remote storage adapter that will be synced occasionally as a backup and
   * loaded from initially. */
  slowStorage?: StorageManager<T>;

  /** The realtime network sync adapter. */
  syncers: {
    [id: string]: { channel: AutodocSyncChannel; manager?: SyncManager };
  } = $state({});

  /** Whether we are waiting for the initial load from storage. */
  firstLoad = $state(true);

  /** The interval that slow storage should be written to when there are changes to the document. */
  slowStorageWriteInterval: number;

  /** Callbacks that must be run to stop in-progress background tasks. */
  stopHooks: (() => void)[] = [];

  constructor({
    init,
    storage,
    slowStorage,
    slowStorageWriteInterval,
    notInComponent,
    onDocChanged,
  }: AutodocInit) {
    this.onDocChanged = onDocChanged;
    this.#view = Automerge.load(init);
    this.#subscribe = createSubscriber((update) => {
      this.#updateSubscribers = update;
    });

    this.storage = storage && new StorageManager(storage);
    this.slowStorage = slowStorage && new StorageManager(slowStorage);
    this.slowStorageWriteInterval = slowStorageWriteInterval || 10 * 1000;

    this.start();
    if (!notInComponent) {
      onDestroy(() => {
        this.stop();
      });
    }
  }

  /** Start initial load and background sync tasks. */
  start() {
    this.stopHooks.push(this.#startStorage());
  }

  /** Stops any background tasks that are running to sync the document. */
  stop() {
    const hooks = [...this.stopHooks];
    hooks.forEach((x) => x());
    this.stopHooks = [];
    this.firstLoad = true;
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

  async loadFromStorage() {
    // Load from normal and slow storage
    for (const storage of [this.storage, this.slowStorage].filter((x) => !!x)) {
      this.view = Automerge.merge(this.view, await storage.loadFromStorage());
    }

    // Allow the sync process to resume after first load
    this.firstLoad = false;
  }

  /**
   * Save document to storage. If `includeSlow` is `true`, it will also get written to the slow
   * storage backend.
   * */
  async saveToStorage(includeSlow = false) {
    this.storage?.saveToStorage(this.view);
    if (includeSlow) this.slowStorage?.saveToStorage(this.view);
  }

  /** Start initial storage load and reactive sync. */
  #startStorage(): () => void {
    untrack(() => {
      // Spawn a task to load doc from storage
      this.loadFromStorage();
    });

    // Create an effect to write to fast storage every time the doc changes.
    $effect(() => {
      if (this.view && !this.firstLoad) {
        // Save to storage when the document changes
        this.saveToStorage();
      }
    });

    // Start task to periodically sync to slow storage
    let interval: number | undefined;
    // TODO: re-enabled slow storage sync ( I just needed it to stop running over the rate limit during dev hot reloads. )

    // if (this.slowStorage) {
    //   interval = setInterval(() => {
    //     this.slowStorage?.saveToStorage(this.view);
    //   }, this.slowStorageWriteInterval) as unknown as number;
    // }

    // Return the stop hook that will cleanup our interval when we're done.
    return () => {
      interval && clearInterval(interval);
    };
  }
}

class StorageManager<T> {
  /** The backing storage interface for this storage manager. */
  storage: AutodocStorageInterface;

  constructor(storage: AutodocStorageInterface) {
    this.storage = storage;
  }

  /** The chunks that we most-recently loaded from storage. */
  loadedChunks: ChunkInfo[] = [];
  /** The heads that we most-recently loaded from storage. */
  loadedHeads: Automerge.next.Heads = [];

  async loadFromStorage(): Promise<Doc<T>> {
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

    // Load the doc data from storage
    const loadedDoc = Automerge.loadIncremental<T>(Automerge.init(), binary);

    // Update loaded chunks & heads
    this.loadedChunks = chunks.map((x) => ({ ...x, data: undefined }));
    this.loadedHeads = Automerge.getHeads(loadedDoc);

    // Return the loaded doc
    return loadedDoc;
  }

  async saveToStorage(doc: Doc<T>) {
    if (!this.storage) return;

    // NOTE: copying the loaded chunks, immediately at the time of triggering the save, is very
    // important to make sure that a concurrent call to loadFromStorage doesn't change the loaded
    // chunks and cause us to delete chunks that we have just loaded and not included in the data
    // being saved in this function.
    let toDelete = [...this.loadedChunks];

    // Get the heads of the current version of the document
    const heads = Automerge.getHeads(doc);

    // Check whether the current version is newer than the last version we loaded from storage.
    const needsSave = Automerge.diff(doc, this.loadedHeads, heads).length > 0;

    // Skip saving if it's already up-to-date
    if (!needsSave) {
      return;
    }

    // Export and hash the document
    const binary = Automerge.save(doc);

    // TODO: do we only need to hash the document heads and not the binary data?
    const hash = await sha256Base32(binary);

    // Just in case, make sure we don't delete the file we're about to create.
    toDelete = toDelete.filter((x) => x.hash !== hash);

    // Safe the document to storage
    await this.storage.save(["data", "snapshot", hash], binary);

    // Delete previously loaded chunks that we no longer need from storage
    for (const chunk of toDelete) {
      await this.storage!.remove(["data", chunk.kind, chunk.hash]);
    }

    // Update our list of loaded chunks to the snapshot we just exported.
    this.loadedChunks = [
      {
        hash,
        kind: "snapshot",
        size: binary.length,
      },
    ];
    this.loadedHeads = heads;
  }
}

export class SyncManager {
  send: (msg: Uint8Array) => void;
  syncState: Automerge.SyncState;

  constructor(send: (msg: Uint8Array) => void) {
    this.send = send;
    this.syncState = Automerge.initSyncState();
  }

  /** Sync doc updates to peer. */
  async sync<T>(doc: Doc<T>) {
    let msg: Uint8Array | null;
    do {
      [this.syncState, msg] = Automerge.generateSyncMessage(
        doc,
        this.syncState,
      );
      if (msg) {
        this.send(msg);
      }
    } while (msg);
  }

  /** Receive a doc update from peer. */
  receiveMessage<T>(doc: Doc<T>, msg: Uint8Array): Doc<T> {
    const [newDoc, newState] = Automerge.receiveSyncMessage(
      doc,
      this.syncState,
      msg,
    );
    this.syncState = newState;
    return newDoc;
  }
}
