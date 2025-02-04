import { user } from "./user.svelte";

let cache: {
  [did: string]: {
    handle: string;
    avatarUrl: string;
    loaded: boolean;
  };
} = $state({});

export function getProfile(did: string): { handle: string; avatarUrl: string } {
  if (!cache[did]) {
    cache[did] = { handle: "", avatarUrl: "", loaded: false };
  }
  const entry = cache[did];

  if (!entry.loaded) {
    if (user.agent) {
      user.agent.getProfile({ actor: did }).then(async (resp) => {
        if (!resp.success) return;
        entry.handle = resp.data.handle;
        entry.avatarUrl = resp.data.avatar || "";
        entry.loaded = true;
      });
    }
  }

  return entry;
}
