import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { Autodoc } from "./autodoc.svelte";
import type { Catalog, Channel } from "./schemas/types";
import { namespacedSubstorage, RoomyPdsStorageAdapter } from "./storage";
import { user } from "./user.svelte";
import catalogInit from "$lib/schemas/catalog.bin?uint8array&base64";
import channelInit from "$lib/schemas/channel.bin?uint8array&base64";

export let g = $state({
  catalog: undefined as Autodoc<Catalog> | undefined,
  dms: {} as { [did: string]: Autodoc<Channel> },
});

$effect.root(() => {
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

  $effect(() => {
    if (user.agent) {
      // Create an Autodoc for every direct message in the catalog.
      for (const [did] of Object.entries(g.catalog?.view.dms || {})) {
        if (!Object.hasOwn(g.dms, did)) {
          g.dms[did] = new Autodoc<Channel>({
            init: channelInit,
            notInComponent: true,
            storage: namespacedSubstorage(
              new IndexedDBStorageAdapter("roomy", "autodoc"),
              "dms",
              did,
            ),
            slowStorage: namespacedSubstorage(
              new RoomyPdsStorageAdapter(user.agent),
              "dms",
              did,
            ),
          });
        }
      }
    }
  });
});
