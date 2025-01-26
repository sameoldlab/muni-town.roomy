import { atprotoClient, scope } from "./atproto";
import { agentStore } from "./agent.svelte";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

function createUserStore() {
  let state: string | null = $state(null);
  let session: OAuthSession | undefined = $state();
  let profile: { data: ProfileViewDetailed | undefined } = $derived.by(() => {
    let data: ProfileViewDetailed | undefined = $state();
    if (session) {
      agentStore.initAgent(session);
      agentStore
        .agent!.getProfile({ actor: agentStore.agent!.assertDid })
        .then((res) => {
          data = res.data;
          console.log("Session Exists!", { data });
        });
    }

    return {
      get data() {
        return data;
      },
    };
  });

  async function loginWithHandle(handle: string) {
    const url = await atprotoClient.authorize(handle, {
      scope,
    });
    window.open(url, "_self", "noopener");

    // Protect against browser's back-forward cache
    await new Promise<never>((resolve, reject) => {
      setTimeout(
        reject,
        10000,
        new Error("User navigated back from the authorization page")
      );
    });
  }

  function logout() {
    localStorage.removeItem("did");
    session = undefined;
    state = null;
  }

  return {
    get state() {
      return state;
    },
    get session() {
      return session;
    },
    get profile() {
      return profile;
    },
    set state(newState) {
      state = newState;
    },
    set session(newSession) {
      session = newSession;
    },
    loginWithHandle,
    logout,
  };
}

export const userStore = createUserStore();
