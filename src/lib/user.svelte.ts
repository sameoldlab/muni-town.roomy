import { redirect } from "@sveltejs/kit";
import { atprotoClient } from "./atproto";
import type { OAuthSession } from "@atproto/oauth-client-browser";

function createUserStore() {
  let state: string | null = $state(null);
  let session: OAuthSession | undefined = $state();

  async function init() {
    const result = await atprotoClient.init();
    if (result && 'state' in result) {
      session = result.session;
      state = result.state;
    }
  }

  async function loginWithHandle(handle: string) {
    const url = await atprotoClient.authorize(handle, {
      scope: "atproto transition:generic"
    });
    redirect(301, url.toString());
  }

  return {
    get state() { return state },
    get session() { return session },
    init,
    loginWithHandle
  }
}

export const userStore = createUserStore();
