<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { setNavbar, setSpaceInfo } from "$lib/components/layout/navbar.svelte";
  import { currentSpaceState } from "$lib/components/layout/current-space.svelte";
  import SearchResultsList from "$lib/components/search/SearchResultsList.svelte";
  import { createFeatureFlagsQuery } from "$lib/queries/feature-flags";
  import { createRoomMetadataQuery } from "$lib/queries/room-metadata";
  import type { SearchMessage } from "$lib/queries/search";
  import { resolveBlobUrl } from "$lib/utils";
  import SpaceAvatar from "@roomy/design/components/spaces/SpaceAvatar.svelte";
  import SeoMeta from "$lib/components/seo/SeoMeta.svelte";
  import { IconSearch } from "@roomy/design/icons";

  // Search feature flag: gates the page — a room is searchable only when
  // the `search` flag is enabled for the user, matching the navbar entry
  // point and the other search pages.
  const flagsQuery = createFeatureFlagsQuery();
  const searchEnabled = $derived(
    flagsQuery.data?.flags.includes("search") ?? false,
  );

  const roomId = $derived(page.params.room!);
  const spaceId = $derived(page.params.space!);
  const query = $derived(page.url.searchParams.get("q") ?? "");
  const currentSpace = $derived(currentSpaceState.value);

  const roomMetaQuery = createRoomMetadataQuery(() => roomId);
  // Display name for the room being searched (from the dedicated metadata
  // query — the room page's sidebar-derived name lives in its own page).
  const roomName = $derived(
    roomMetaQuery.data?.name ?? (roomMetaQuery.isSuccess ? "room" : "…"),
  );
  // `space.roomy.room.getMetadata` reports the kind (`channel`/`thread`):
  // a thread-scoped search is the thread alone — no rooms-and-threads
  // name section (the parent channel isn't in scope either).
  const isThread = $derived(roomMetaQuery.data?.kind === "thread");

  onMount(() => {
    setNavbar(searchNavbar);
    setSpaceInfo(searchSpaceInfo);
    return () => {
      setNavbar(undefined);
      setSpaceInfo(undefined);
    };
  });
</script>

<SeoMeta
  title={`Search in ${roomName} - ${currentSpace?.name ?? "Space"} - Roomy`}
  description={`Search messages in ${roomName}`}
/>

{#snippet searchSpaceInfo()}
  <div class="flex items-center gap-2 ml-4 sm:ml-2 min-w-0">
    <!-- Space context (avatar): mobile-only, mirroring NavbarSpaceInfo. -->
    {#if currentSpace}
      <span class="sm:hidden shrink-0">
        <SpaceAvatar
          src={resolveBlobUrl(currentSpace.avatar)}
          id={currentSpace.id}
          name={currentSpace.name ?? undefined}
          size={24}
        />
      </span>
    {/if}
    <span class="text-base-300 dark:text-base-700 shrink-0 sm:hidden">/</span>
    <span class="shrink-0 sm:hidden text-base-400">#</span>
  </div>
{/snippet}

{#snippet searchNavbar()}
  <div class="flex w-full items-center gap-2 px-2 min-w-0 grow">
    <IconSearch class="size-4 shrink-0 text-base-400" />
    <span class="text-sm font-semibold truncate">
      Search in {roomName}
    </span>
  </div>
{/snippet}

<div class="h-full dark:bg-base-900/20 text-base-800 dark:text-base-200">
  {#if !searchEnabled}
    <div class="h-full flex items-center justify-center">
      <p class="text-sm text-base-500 dark:text-base-400">
        Search is not enabled for your account yet.
      </p>
    </div>
  {:else}
    <SearchResultsList
      {query}
      {spaceId}
      {roomId}
      placeholder={isThread
        ? `Search messages in ${roomName}…`
        : `Search rooms and messages in ${roomName}…`}
      disableRoomsSearch={isThread}
      hrefFor={(m: SearchMessage) => `/${m.spaceId}/${m.roomId}?message=${m.id}`}
    />
  {/if}
</div>
