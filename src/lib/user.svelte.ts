import { atprotoClient } from "./atproto";
import type { OAuthSession } from "@atproto/oauth-client-browser";

function createUserStore() {
  let state: string | null = $state(null);
  let session: OAuthSession | undefined = $state();

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

  return {
    get state() { return state },
    get session() { return session },
    set state(newState) { state = newState; },
    set session(newSession) { session = newSession; },
    loginWithHandle
  }
}

export const userStore = createUserStore();
