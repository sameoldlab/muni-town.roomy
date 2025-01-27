import { atproto } from "./atproto.svelte";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Agent } from "@atproto/api";
import { Repo } from "@automerge/automerge-repo";
import { dev } from "$app/environment";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { lexicons } from "./lexicons";
import { decodeBase32 } from "./base32";

type Keypair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

let session: OAuthSession | undefined = $state();
let agent: Agent | undefined = $state();
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

let keypair: {
  value: Keypair | undefined;
} = $derived.by(() => {
  let value: Keypair | undefined = $state();
  if (session && agent) {
    agent
      .call("key.v0.roomy.muni.town", undefined, undefined, {
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

let repo = $derived.by(() => {
  if (!session) return;
  const did = session.did;

  return new Repo({
    isEphemeral: false,
    storage: new IndexedDBStorageAdapter(did, "automerge-repo"),
  });
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
    if (dev) {
      (globalThis as any).user = this;
    }

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
