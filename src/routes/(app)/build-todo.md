Note: Deno server crashes on edits while running with tauri. temp using pnpm 

Tauri will display a blank page if these are uncommented even while the same server runs fine in a browser

/+layout.svelte
- { g } from "$lib/global.svelte"
  - { Peer, Autodoc } from "./autodoc/peer";
    - { StorageManager, type StorageInterface } from "./storage";
      - { next as Automerge } from "@automerge/automerge";
    - { next as Automerge } from "@automerge/automerge";
  - { encryptedStorage } from "./autodoc/storage";
    - { next as Automerge } from "@automerge/automerge";
  - { next as Automerge } from "@automerge/automerge";
- { cleanHandle } from "$lib/utils"
  - { next as Automerge } from "@automerge/automerge";
- { RoomyPdsStorageAdapter } from "$lib/autodoc-storage"
  - { resolveDid } from "./utils";
    - { next as Automerge } from "@automerge/automerge";


/+page.svelte
 - window.location.href = "/dm";
   - resolved while patching layout


so tauri does not like {next} from "@automerge/automerge"
