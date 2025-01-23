import { redirect } from "@sveltejs/kit";
import { createAtProtoClient } from "./atproto";

async function createUserStore() {
  let state = $state();
  let session = $state();

  const client = await createAtProtoClient();

  async function initClient() {
    const result = await client.init();
    if (result && 'state' in result) {
      session = result.session;
      state = result.state;
    }
  }

  async function loginWithHandle(handle: string) {
    const url = await client.authorize(handle, {
      scope: "atproto transition:generic"
    });
    redirect(301, url.toString());
  }

  return {
    get state() { return state },
    get session() { return session },
    initClient,
    loginWithHandle
  }
}

export const userStore = await createUserStore();
