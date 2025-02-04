import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { Autodoc, SyncManager } from "./autodoc.svelte";
import type { Catalog, Channel } from "./schemas/types";
import {
  namespacedSubstorage,
  RoomyPdsStorageAdapter,
} from "./autodoc-storage";
import { user } from "./user.svelte";
import catalogInit from "$lib/schemas/catalog.bin?uint8array&base64";
import channelInit from "$lib/schemas/channel.bin?uint8array&base64";
import { RouterClient } from "@jsr/roomy-chat__router/client";
import { encodeRouterSyncMsg, parseRouterSyncMsg } from "./autodoc-network";

export let g = $state({
  catalog: undefined as Autodoc<Catalog> | undefined,
  dms: {} as { [did: string]: Autodoc<Channel> },
  router: undefined as RouterClient | undefined,
  routerConnections: {} as { [did: string]: string[] },
  syncManagers: {
    dms: {} as { [did: string]: { [connId: string]: SyncManager } },
  },
});

(globalThis as any).g = g;

$effect.root(() => {
  // Update catalog
  $effect(() => {
    if (user.agent) {
      if (g.catalog) g.catalog.stop();

      g.catalog = new Autodoc<Catalog>({
        init: catalogInit,
        notInComponent: true,
        storage: namespacedSubstorage(
          new IndexedDBStorageAdapter("roomy", "autodoc"),
          "catalog",
        ),
        slowStorage: namespacedSubstorage(
          new RoomyPdsStorageAdapter(user.agent),
          "catalog",
        ),
      });
    }
  });

  // Update DMs
  $effect(() => {
    if (user.agent) {
      // Create an Autodoc for every direct message in the catalog.
      for (const [did] of Object.entries(g.catalog?.view.dms || {})) {
        if (!Object.hasOwn(g.dms, did)) {
          let key = [did, user.agent.assertDid];
          key.sort();

          const doc = new Autodoc<Channel>({
            init: channelInit,
            notInComponent: true,
            slowStorageWriteInterval: 60 * 1000,
            storage: namespacedSubstorage(
              new IndexedDBStorageAdapter("roomy", "autodoc"),
              "dms",
              ...key,
            ),
            slowStorage: namespacedSubstorage(
              new RoomyPdsStorageAdapter(user.agent, did),
              "dms",
              ...key,
            ),
            onDocChanged() {
              // When the doc changes, get any open sync managers for this DM and sync the changes
              // to them.
              const managers = Object.values(g.syncManagers.dms[did] || {});
              for (const manager of managers) {
                manager.sync(doc.view);
              }
            },
          });

          g.dms[did] = doc;
        }
      }
    }
  });

  // Create router connection
  $effect(() => {
    (async () => {
      if (user.agent) {
        // Fetch a router authentication token
        const resp = await user.agent.call(
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
          console.error("Error obtaining router auth token", resp);
          return;
        }
        const token = resp.data.token as string;

        // Open router client
        g.router = new RouterClient(
          token,
          `wss://v0.router.roomy.chat/connect/as/${user.agent.assertDid}`,
          {
            error(e) {
              console.log("Router connection error", e);
            },
            receive(did, connId, msg) {
              const { docId, data } = parseRouterSyncMsg(msg);
              if (docId == "dm") {
                const doc = g.dms[did];
                const manager = g.syncManagers.dms[did][connId];
                if (manager) {
                  doc.view = manager.receiveMessage(doc.view, data);
                }
              }
            },
            join(did, connId) {
              if (!g.routerConnections[did]) g.routerConnections[did] = [];
              const conns = g.routerConnections[did];
              conns.push(connId);

              const manager = new SyncManager(async (msg) => {
                g.router?.send(
                  did,
                  connId,
                  encodeRouterSyncMsg({ docId: "dm", data: msg }),
                );
              });
              if (!g.syncManagers.dms[did]) g.syncManagers.dms[did] = {};

              const managers = g.syncManagers.dms[did];
              managers[connId] = manager;
            },
            leave(did, connId) {
              if (!connId) {
                delete g.routerConnections[did];
                delete g.syncManagers.dms[did];
              } else {
                const conns = g.routerConnections[did] || [];
                g.routerConnections[did] = conns.filter((x) => x !== connId);
                delete g.syncManagers.dms[did][connId];
              }
            },
            open() {
              console.log("Connected to router");
            },
          },
        );
      }
    })();
  });

  // Update router listening when dm list changes
  $effect(() => {
    if (g.router && g.dms) {
      // When the router connection is opened
      g.router.open.then(() => {
        if (g.router) {
          // Tell the router we want to be notified for join/leave events for all of our DMs
          g.router.listen(...Object.keys(g.dms));
          // Ask for the current status of every user in our DMs
          for (const dm of Object.keys(g.dms)) {
            g.router.ask(dm);
          }
        }
      });
    }
  });
});
