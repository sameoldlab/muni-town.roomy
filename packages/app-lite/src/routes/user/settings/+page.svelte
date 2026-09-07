<script lang="ts">
  import Button from "@roomy/design/components/ui/button/Button.svelte";
  import SpaceAvatar from "@roomy/design/components/spaces/SpaceAvatar.svelte";
  import ThemeSettings from "@roomy/design/components/user/ThemeSettings.svelte";
  import { createSpacesQuery } from "$lib/queries/spaces";
  import { joinSpace } from "$lib/mutations/space";
  import { queryClient } from "$lib/client";
  import { cache } from "@roomy-space/sdk";
  import { resolveBlobUrl } from "$lib/utils";
  import ErrorMessage from "@roomy/design/components/helper/ErrorMessage.svelte";
  import Switch from "@roomy/design/components/ui/toggle/Toggle.svelte";
  import {
    checkUpdate,
    enableAutoupdate,
  } from "$lib/platform.svelte";
  import type { Update as TauriUpdate } from "@tauri-apps/plugin-updater";

  const spacesQuery = createSpacesQuery({ includeLeft: true });

  let rejoining = $state<string | null>(null);

  async function rejoin(spaceId: string) {
    rejoining = spaceId;
    try {
      await joinSpace(spaceId);
      await queryClient.invalidateQueries({
        queryKey: cache.queryKey("space.roomy.space.getSpaces"),
      });
    } catch (e) {
      console.error("Failed to rejoin space", e);
    } finally {
      rejoining = null;
    }
  }
  // TODO: expose this as an env flag during build,
  //       for package managers handling updates externally.
  const DISABLE_AUTO_UPDATE = false;
  const desktopUpdatesEnabled =
    "__TAURI__" in window &&
    window.__TAURI__ &&
    "updater" in window.__TAURI__ &&
    !DISABLE_AUTO_UPDATE;
  let update: TauriUpdate | null | undefined = $state(undefined);
  let updateDownloadProgress = $state(0);
  let updateDowloadSize = $state(0);

  const downloadUpdate = async () => {
  	if (!update) return
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          updateDowloadSize = event.data.contentLength ?? 0;
          break;
        case "Progress":
          updateDownloadProgress += event.data.chunkLength;
          break;
        case "Finished":
        	update = undefined;
          break;
      }
    });
  };
</script>

<div class="flex flex-col gap-10">
  <!-- Theme section -->
  <section>
    <h2 class="text-base font-semibold mb-4 text-base-900 dark:text-base-100">
      Theme
    </h2>
    <ThemeSettings />
  </section>

  <!-- Left Spaces section -->
  <section>
    <h2 class="text-base font-semibold mb-4 text-base-900 dark:text-base-100">
      Left Spaces
    </h2>

    {#if spacesQuery.isPending}
      <p class="text-sm text-base-400">Loading spaces…</p>
    {:else if spacesQuery.isError}
      <ErrorMessage message="Error: {spacesQuery.error.message}" class="py-8" />
    {:else if spacesQuery.data}
      {@const left = spacesQuery.data.spaces.filter(
        (s: { isMember: boolean }) => !s.isMember,
      )}

      {#if left.length === 0}
        <p class="text-sm text-base-400">No left spaces.</p>
      {:else}
        <div class="flex flex-row gap-6 flex-wrap">
          {#each left as space (space.id)}
            <div
              class="flex flex-col items-center gap-2 w-32 opacity-85 hover:opacity-100 transition-opacity"
            >
              <SpaceAvatar
                src={resolveBlobUrl(space.avatar)}
                id={space.id}
                name={space.name ?? undefined}
                size={64}
              />
              <span
                class="text-sm font-medium text-center text-base-700 dark:text-base-300 line-clamp-2"
              >
                {space.name || "Unnamed Space"}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onclick={() => rejoin(space.id)}
                disabled={rejoining === space.id}
              >
                {rejoining === space.id ? "Joining…" : "Rejoin"}
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>
  <!-- Updates section -->
  {#if desktopUpdatesEnabled}
    <section>
      <h2 class="text-base font-semibold mb-4 text-base-900 dark:text-base-100">
        App Updates
      </h2>

      <div class="flex flex-col w-full text-base-700 dark:text-base-300">
        <div class="flex items-center justify-between py-2 pr-0.5">
          <div class="flex flex-col">
            <p class="text-sm font-medium">
              Currently on Roomy v{#await window.__TAURI__.app?.getVersion() then version}
                {version}
              {/await}
            </p>
            <p class="text-sm font-medium text-base-400">
              {#if update}
                v{update.version} available
              {/if}
            </p>
          </div>
          <Button
            onclick={() => {
              if (!update) checkUpdate().then((u) => (update = u));
              else downloadUpdate();
            }}
            >{#if !update}
              Check for Updates
            {:else}
              Install
            {/if}
          </Button>
        </div>
        <div class="flex items-center justify-between py-2 pr-0 5">
          <div>
            <p>Enable Autoupdate</p>
            <p class="text-base-400">
              Download and install new versions in the background
            </p>
          </div>
          <Switch bind:checked={enableAutoupdate.value} />
        </div>
      </div>
    </section>
  {/if}
</div>
