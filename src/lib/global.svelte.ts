import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { Autodoc } from "./autodoc.svelte";
import type { Catalog } from "./schemas/types";
import { namespacedSubstorage, RoomyPdsStorageAdapter } from "./storage";
import { user } from "./user.svelte";
import catalogInit from "$lib/schemas/catalog.bin?uint8array&base64";

export let g = $state({
  catalog: undefined as Autodoc<Catalog> | undefined,
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
});
