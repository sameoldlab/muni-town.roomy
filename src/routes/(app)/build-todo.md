Tauri will display a blank page if these are uncommented even while the same server runs fine in a browser

/+layout.svelte
- { RoomyPdsStorageAdapter } from "$lib/autodoc-storage"
- { g } from "$lib/global.svelte"
- { cleanHandle } from "$lib/utils"

/+page.svelte
 - window.location.href = "/dm";
