import { atproto } from "./atproto.svelte";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Agent } from "@atproto/api";
import {
  Repo,
  type DocHandle,
  type AnyDocumentId,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { lexicons } from "./lexicons";
import { decodeBase32 } from "./base32";
import { reactiveDoc, type ReactiveDoc } from "./automergeUtils.svelte";

type Keypair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

let session: OAuthSession | undefined = $state();
let agent: Agent | undefined = $state();

/** The user's atproto profile information. */
let profile: { data: ProfileViewDetailed | undefined } = $derived.by(() => {
  let data: ProfileViewDetailed | undefined = $state();
  if (session && agent) {
    agent.getProfile({ actor: agent.assertDid }).then((res) => {
      data = res.data;
    });
  }
  return {
    get data() {
      return data;
    },
  };
});

/** The user's Roomy keypair. */
let keypair: {
  value: Keypair | undefined;
} = $derived.by(() => {
  let value: Keypair | undefined = $state();

  if (session && agent) {
    agent
      .call("town.muni.roomy.v0.key", undefined, undefined, {
        headers: {
          "atproto-proxy": "did:web:keyserver.roomy.muni.town#roomy_keyserver",
        },
      })
      .then((resp) => {
        value = {
          publicKey: new Uint8Array(decodeBase32(resp.data.publicKey)),
          privateKey: new Uint8Array(decodeBase32(resp.data.publicKey)),
        };
      });
  }
  return {
    get value() {
      return value;
    },
  };
});

/** The user's automerge repository. */
let repo = $derived.by(() => {
  if (!session) return;
  const did = session.did;

  return new Repo({
    isEphemeral: false,
    storage: new IndexedDBStorageAdapter(did, "automerge-repo"),
  });
});

/**
 * The type of the user's "index", the list of all of the chat spaces / direct messages they're
 * apart of. */
export type Index = {
  /**
   * The list of direct messages, mapping the DID of the user they are messaging with the automerge
   * document URL.
   * */
  dms: {
    [did: string]: {
      handle: string;
    };
  };
};

/** The user's "index" listing all of their chat rooms and direct messages they've joined. */
let index: {
  value: ReactiveDoc<Index> | undefined;
} = $derived.by(() => {
  let value: ReactiveDoc<Index> | undefined = $state();

  const uploadIndex = async (repo: Repo, id: AnyDocumentId) => {
    // Export it to binary
    const exp = await repo.export(id);
    // Upload it to the PDS.
    const upResp = await agent!.com.atproto.repo.uploadBlob(exp);
    if (!upResp || !upResp.success)
      throw "Could not upload index export to PDS.";
    const blobId = upResp.data.blob;

    // Add the record to the PDS
    const putResp = await agent!.com.atproto.repo.putRecord({
      collection: "town.muni.roomy.v0.index",
      repo: agent!.assertDid,
      rkey: "self",
      record: {
        id: id,
        data: blobId,
      },
    });
    if (!putResp.success) throw "Could not set index record on PDS";
  };

  const uploadDocWhenChanged = (repo: Repo, doc: DocHandle<Index>) => {
    doc.on("change", () => {
      uploadIndex(repo, doc.url);
    });
  };

  const createNewIndex = async (repo: Repo) => {
    // Create the document
    const indexHandle = repo.create<Index>({ dms: {} });
    // Upload it to the PDS
    await uploadIndex(repo, indexHandle.url);
    // Re-upload when changed
    uploadDocWhenChanged(repo, indexHandle);
    // And set the value
    value = reactiveDoc(indexHandle);
  };

  if (session && agent && repo) {
    agent.com.atproto.repo
      .getRecord({
        collection: "town.muni.roomy.v0.index",
        repo: session.did,
        rkey: "self",
      })
      .then(async (resp) => {
        if (!resp.success) {
          return createNewIndex(repo);
        }
        const v = resp.data.value as {
          id: string;
          data: { ref: { toString(): string } };
        };
        const blob = await agent!.com.atproto.sync.getBlob({
          cid: v.data.ref.toString(),
          did: agent!.assertDid,
        });
        if (!blob.success) throw "Could not download index export from PDS";
        let indexHandle = repo.find<Index>(v.id as AutomergeUrl);
        console.log("Loaded local index", await indexHandle.doc());

        const imported = repo.import<Index>(blob.data);
        let handle: DocHandle<Index>;
        if (indexHandle.docSync()) {
          console.log("Imported index from PDS", await imported.doc());
          indexHandle.merge(imported);
          console.log("Merged index into local", await indexHandle.doc());
          repo.delete(imported.url);
          handle = indexHandle;
        } else {
          console.log("Using imported handle", await imported.doc());
          handle = imported;
        }

        uploadDocWhenChanged(repo, handle);
        console.log("output", await handle.doc());
        value = reactiveDoc(handle);
      })
      // If we don't have an index, we need to create one.
      .catch(async () => {
        createNewIndex(repo);
      });
  }
  return {
    get value() {
      return value;
    },
  };
});

/** The user store. */
export const user = {
  /**
   * The AtProto agent that can be used to interact with the AtProto API
   * through the user's login.
   * */
  get agent() {
    return agent;
  },

  /**
   * The AtProto OAuth login session for the user.
   */
  get session() {
    return session;
  },
  set session(newSession) {
    session = newSession;
    if (newSession) {
      // Store the user's DID on login
      localStorage.setItem("did", newSession.did);
      agent = new Agent(newSession);
      lexicons.forEach((l) => agent!.lex.add(l));
    } else {
      agent = undefined;
      localStorage.removeItem("did");
    }
  },

  /**
   * The user's profile information from AtProto.
   */
  get profile() {
    return profile;
  },

  get index() {
    return index;
  },

  get keypair() {
    return keypair;
  },

  /** Interface to the user's chat data. */
  get repo() {
    return repo;
  },

  /**
   * Initialize the user store, setting up the oauth client, and restoring previous session if
   * necessary.
   * */
  async init() {
    // Add the user store to the global scope so it can easily be accessed in dev tools
    (globalThis as any).user = this;

    // Initialize oauth client.
    await atproto.init();

    // if there's a stored DID on localStorage and no session
    // restore the session
    const storedDid = localStorage.getItem("did");
    if (!session && storedDid) {
      atproto.oauth.restore(storedDid).then((s) => (this.session = s));
    }
  },

  /** Login a user using their handle, replacing the existing session if any. */
  async loginWithHandle(handle: string) {
    const url = await atproto.oauth.authorize(handle, {
      scope: atproto.scope,
    });
    window.open(url, "_self", "noopener");

    // Protect against browser's back-forward cache
    await new Promise<never>((_resolve, reject) => {
      setTimeout(
        reject,
        10000,
        new Error("User navigated back from the authorization page"),
      );
    });
  },

  /** Logout the user. */
  logout() {
    localStorage.removeItem("did");
    session = undefined;
  },
};
