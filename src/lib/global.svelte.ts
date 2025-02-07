import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import type { Catalog, Channel } from "./schemas/types";
import { namespacedSubstorage } from "./autodoc-storage";
import { user } from "./user.svelte";
import catalogInit from "$lib/schemas/catalog.bin?uint8array&base64";
import channelInit from "$lib/schemas/channel.bin?uint8array&base64";
import { RouterClient } from "@jsr/roomy-chat__router/client";
import { Peer, Autodoc } from "./autodoc/peer";
import type { Agent } from "@atproto/api";

export let g = $state({
  catalog: undefined as Autodoc<Catalog> | undefined,
  dms: {} as { [did: string]: Autodoc<Channel> },
  router: undefined as RouterClient | undefined,
  routerConnections: {} as { [did: string]: string[] },
  peer: undefined as Peer | undefined,
});
(globalThis as any).g = g;

async function createPeer(agent: Agent, privateKey: Uint8Array): Promise<Peer> {
  // Fetch a router authentication token
  const resp = await agent.call(
    "chat.roomy.v0.router.token",
    undefined,
    undefined,
    {
      headers: {
        "atproto-proxy": "did:web:v0.router.roomy.chat#roomy_router",
      },
    },
  );
  if (!resp.success) {
    throw new Error(`Error obtaining router auth token ${resp}`);
  }
  const token = resp.data.token as string;

  // Open router client
  const router = new RouterClient(
    token,
    `wss://v0.router.roomy.chat/connect/as/${agent.assertDid}`,
  );

  // Initialize peer
  return await Peer.init({
    router,
    privateKey,
    storageFactory(docId) {
      return namespacedSubstorage(
        new IndexedDBStorageAdapter("roomy", "autodoc"),
        docId,
      );
    },
  });
}

$effect.root(() => {
  // Create peer when agent is initialized
  $effect(() => {
    if (user.agent && user.keypair.value?.privateKey && !g.peer) {
      createPeer(user.agent, user.keypair.value.privateKey).then(
        (peer) => (g.peer = peer),
      );
    }
  });

  // Create catalog when peer is initialized
  $effect(() => {
    if (user.agent && g.peer && !g.catalog) {
      g.catalog = g.peer.open(`${user.agent.assertDid}/catalog`, catalogInit);
    }
  });

  // Open DM documents when they are added to the catalog
  $effect(() => {
    if (user.agent && user.keypair.value && g.peer) {
      // Create an Autodoc for every direct message in the catalog.
      for (const [did] of Object.entries(g.catalog?.view.dms || {})) {
        if (!Object.hasOwn(g.dms, did)) {
          (async () => {
            if (!(user.agent && user.keypair.value && g.peer)) return;

            // Create docId from DIDs
            let dids = [did, user.agent.assertDid];
            dids.sort();
            const docId = `dm/${dids.join("/")}`;

            // Open the doc
            const doc = g.peer.open<Channel>(docId, channelInit);
            g.dms[did] = doc;
          })();
        }
      }
    }
  });
});
