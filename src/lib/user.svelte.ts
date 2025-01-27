import { atproto } from "./atproto.svelte";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Agent } from "@atproto/api";

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
    if (newSession) {
      // Store the user's DID on login
      localStorage.setItem("did", newSession.did);
    }
    session = newSession;
    agent = newSession && new Agent(newSession);
  },

  /**
   * The user's profile information from AtProto.
   */
  get profile() {
    return profile;
  },

  /**
   * Initialize the user store, setting up the oauth client, and restoring previous session if
   * necessary.
   * */
  async init() {
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
