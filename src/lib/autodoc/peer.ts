import type { DocId, RouterClient } from "@jsr/roomy-chat__router/client";
import * as Automerge from "@automerge/automerge";
import type { Doc } from "@automerge/automerge";
import { TypedEventTarget } from "typescript-event-target";
import { StorageManager, type StorageInterface } from "./storage";
import { createSubscriber } from "svelte/reactivity";
import { calculateSharedSecretEd25519, decrypt, encrypt } from "./encryption";
import { resolvePublicKey } from "$lib/utils";
import { debounce } from "underscore";

function getOrDefault<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }
  return map.get(key)!;
}

interface PeerOpts {
  router: RouterClient;
  privateKey: Uint8Array;
  storageFactory?: (docId: DocId) => Promise<StorageInterface | undefined>;
  slowStorageFactory?: (docId: DocId) => Promise<StorageInterface | undefined>;
  slowStorageDebouncePeriod?: number;
}

export class Peer {
  #subscribe: () => void;
  #updateSubscribers: () => void;

  /** Our Roomy router connection */
  router: RouterClient;

  /** This peers private key. */
  privateKey: Uint8Array;

  /** The sync managers for each connected peer. */
  syncManagers: Map<
    DocId,
    { connId: string; did: string; manager: SyncManager }[]
  > = new Map();

  /** The map of opened documents. */
  #autodocs: Map<DocId, Autodoc<any>> = new Map();

  get docs(): Map<DocId, Autodoc<any>> {
    this.#subscribe();
    return this.#autodocs;
  }

  /** The factory we use to create storage managers for each open document. */
  storageFactory?: (docId: DocId) => Promise<StorageInterface | undefined>;
  /** The factory we use to create storage managers for opened documents that are synced
   * periodically instead of on every chage. */
  slowStorageFactory?: (docId: DocId) => Promise<StorageInterface | undefined>;
  slowStorageDebouncePeriod: number = 5 * 1000;

  constructor({
    router,
    storageFactory,
    slowStorageFactory,
    slowStorageDebouncePeriod,
    privateKey,
  }: PeerOpts) {
    this.router = router;
    this.privateKey = privateKey;
    this.storageFactory = storageFactory;
    this.slowStorageFactory = slowStorageFactory;
    if (slowStorageDebouncePeriod)
      this.slowStorageDebouncePeriod = slowStorageDebouncePeriod;

    this.#updateSubscribers = () => {};
    this.#subscribe = createSubscriber((update) => {
      this.#updateSubscribers = update;
    });

    // Cleanup sync managers when connection is closed
    this.router.addEventListener("close", () => {
      this.syncManagers.clear();
    });

    // Add sync managers when new peers join
    this.router.addEventListener("join", async ({ did, connId, docId }) => {
      const managersForDoc = getOrDefault(this.syncManagers, docId, []);
      const encryptionKey = calculateSharedSecretEd25519(
        this.privateKey,
        await resolvePublicKey(did),
      );
      const manager = new SyncManager((msg) => {
        this.router.send(did, connId, docId, encrypt(encryptionKey, msg));
      });
      const doc = this.#autodocs.get(docId);
      if (doc) manager.sync(doc.view);
      managersForDoc.push({
        did,
        connId,
        manager,
      });
    });

    // Remove sync managers when peers leave
    this.router.addEventListener("leave", ({ did, connId, docId }) => {
      const managersForDoc = this.syncManagers.get(docId);
      if (managersForDoc) {
        this.syncManagers.set(
          docId,
          managersForDoc.filter((x) => x.did !== did || x.connId !== connId),
        );
      }
    });

    // Send sync managers the data from peers
    this.router.addEventListener(
      "data",
      async ({ data, did, connId, docId }) => {
        const managers = this.syncManagers.get(docId) || [];
        const { manager } =
          managers.find((x) => x.did == did && x.connId == connId) || {};

        const encryptionKey = calculateSharedSecretEd25519(
          this.privateKey,
          await resolvePublicKey(did),
        );

        if (!manager) return;
        const autodoc = this.#autodocs.get(docId);
        if (!autodoc) {
          console.warn("Got message from doc we don't have locally:", docId);
          return;
        }
        const newDoc = manager.receiveMessage(
          autodoc.view,
          decrypt(encryptionKey, data),
        );
        autodoc.view = newDoc;
      },
    );

    // Log errors
    this.router.addEventListener("error", (e) =>
      console.error("Router error", e),
    );
  }

  /** Init a new peer and wait until it is ready to send / receive messages. */
  static async init(opts: PeerOpts): Promise<Peer> {
    const peer = new Peer(opts);
    await peer.router.open;
    return peer;
  }

  /** Open a document */
  open<T>(docId: DocId, initSchema: Uint8Array): Autodoc<T> {
    const autodoc = new Autodoc<T>({
      docId,
      initSchema,
      peer: this,
    });

    // Add this document to the list of documents we're listening to.
    this.router.addInterests(docId);

    // When the doc changes, sync it with any interested peers.
    autodoc.addEventListener("change", () => {
      const syncManagers = this.syncManagers.get(docId) || [];
      for (const { manager } of syncManagers) {
        manager.sync(autodoc.view);
      }
    });

    this.#autodocs.set(docId, autodoc);
    this.#updateSubscribers();

    return autodoc;
  }
}

export class Autodoc<T> extends TypedEventTarget<{ change: Event }> {
  #doc: Doc<T>;
  storage?: StorageManager;
  #saveWhenStorageLoaded = false;
  slowStorage?: StorageManager;
  #slowStorageSaveDebounced?: () => void;

  #subscribe: () => void;
  #updateSubscribers: () => void;

  get view(): Doc<T> {
    this.#subscribe();
    return this.#doc;
  }

  set view(value: Doc<T>) {
    // Update the doc
    this.#doc = value;

    // Save to local storage
    if (this.storage) {
      this.storage.saveToStorage(this.#doc);
    } else {
      this.#saveWhenStorageLoaded = true;
    }

    // Debounced save to slow storage
    if (this.#slowStorageSaveDebounced) this.#slowStorageSaveDebounced();

    // Send the change event
    this.dispatchTypedEvent("change", new Event("change"));
    // And update any svelte subscribers
    this.#updateSubscribers();
  }

  constructor({
    peer,
    docId,
    initSchema,
  }: {
    peer: Peer;
    docId: DocId;
    initSchema: Uint8Array;
  }) {
    super();
    // Setup svelte subscriber
    this.#updateSubscribers = () => {};
    this.#subscribe = createSubscriber((update) => {
      this.#updateSubscribers = update;
    });

    // Initialize the doc from the initial schema.
    this.#doc = Automerge.load(initSchema);

    // Load document from local storage
    if (peer.storageFactory) {
      peer.storageFactory(docId).then((adapter) => {
        if (!adapter) return;

        this.storage = new StorageManager(adapter);
        this.storage.loadFromStorage<T>().then((doc) => {
          if (doc) this.view = Automerge.merge(this.view, doc);
        });
        if (this.#saveWhenStorageLoaded == true) {
          this.#saveWhenStorageLoaded = false;
          this.storage.saveToStorage(this.#doc);
        }
      });
    }

    // Also merge document with slow storage
    if (peer.slowStorageFactory) {
      peer.slowStorageFactory(docId).then((adapter) => {
        if (adapter) {
          this.slowStorage = new StorageManager(adapter);
          this.slowStorage.loadFromStorage<T>().then((doc) => {
            if (doc) this.view = Automerge.merge(this.view, doc);
          });
          this.#slowStorageSaveDebounced = debounce(
            () => this.slowStorage?.saveToStorage(this.view),
            peer.slowStorageDebouncePeriod,
          );
        }
      });
    }
  }

  change(changer: Automerge.ChangeFn<T>) {
    this.view = Automerge.change(this.view, changer);
  }

  heads(): Automerge.Heads {
    return Automerge.getHeads(this.view);
  }
}

export class SyncManager {
  /** Function used to send messages to the remote peer. */
  send: (msg: Uint8Array) => void;
  /** Synchronization state for the remote peer. */
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
