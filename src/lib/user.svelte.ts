import { atprotoClient } from "./atproto";
import { agentStore } from "./agent.svelte";
import type { OAuthSession } from "@atproto/oauth-client-browser";

function createUserStore() {
  let state: string | null = $state(null);
  let session: OAuthSession | undefined = $state();
  let profile = $derived.by(async () => {
    if (session) {
      agentStore.initAgent(session)
      return await agentStore.agent?.getProfile({ actor: agentStore.agent.assertDid });
    }
  });

  async function loginWithHandle(handle: string) {
    const url = await atprotoClient.authorize(handle, {
      scope: "atproto transition:generic"
    });
    window.open(url, '_self', 'noopener');

    // Protect against browser's back-forward cache
    await new Promise<never>((resolve, reject) => {
      setTimeout(
        reject,
        10000,
        new Error('User navigated back from the authorization page'),
      )
    });
  }

  function logout() {
    session = undefined;
    state = null;
    // TODO: remove session from indexedDB
  }

  return {
    get state() { return state },
    get session() { return session },
    get profile() { return profile },
    set state(newState) { state = newState; },
    set session(newSession) { session = newSession; },
    loginWithHandle,
    logout
  }
}

export const userStore = createUserStore();
