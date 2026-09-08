<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import {
    createSearchMessagesQuery,
    type SearchMessage,
    type SearchScope,
  } from "$lib/queries/search";
  import {
    createSearchRoomsQuery,
    type RoomSearchResult,
  } from "$lib/queries/search-rooms";
  import { resolveBlobUrl } from "$lib/utils";
  import ErrorMessage from "@roomy/design/components/helper/ErrorMessage.svelte";
  import MessageBubble from "@roomy/design/components/content/thread/message/MessageBubble.svelte";
  import SpaceAvatar from "@roomy/design/components/spaces/SpaceAvatar.svelte";
  import UserAvatar from "@roomy/design/components/user/UserAvatar.svelte";
  import MessageContent from "../chat/MessageContent.svelte";
  import ForwardContext from "../chat/ForwardContext.svelte";
  import MessageReactions from "../chat/MessageReactions.svelte";
  import MediaEmbed from "../chat/embeds/MediaEmbed.svelte";
  import LinkCard from "../chat/embeds/LinkCard.svelte";
  import { messageContentToPlaintext } from "../chat/messagePreview";
  import {
    IconSearch,
    IconChevronRight,
    IconNeedleThread,
    IconForward,
    IconHashtag,
    IconReplyLine,
  } from "@roomy/design/icons";

  let {
    query,
    placeholder,
    scopeLabel,
    showSpaceInfo = false,
    spaceId,
    roomId,
    hrefFor,
    disableRoomsSearch = false,
  }: {
    /** Initial search term (e.g. the URL `?q=` param). */
    query: string;
    placeholder: string;
    /** Natural-language search scope for the hint, e.g. "all your spaces". */
    scopeLabel: string;
    /** Render the space + room context line above each result run (directory search). */
    showSpaceInfo?: boolean;
    /** Skip the rooms-and-threads name section (thread-scoped searches). */
    disableRoomsSearch?: boolean;
    /** Narrow the search to one space (space index search). */
    spaceId?: string;
    /** Narrow the search to one room (room-scoped search). */
    roomId?: string;
    /** Deep-link builder for a result. */
    hrefFor: (m: SearchMessage) => string;
  } = $props();

  // ── Term state ────────────────────────────────────────────────────────
  // `input` is bound to the text field; `term` is what the query watches.
  let input = $state(query);
  let term = $state(query);
  // Last query prop the local state was synced from (the prop itself is
  // stable across renders, so this guards against re-clobbering the user's
  // in-progress typing).
  let lastSyncedQuery = $state(query);

  // External ?q= changes (navbar search submit) resync immediately — no
  // debounce, so the new term fires without a stale-results pause.
  $effect(() => {
    if (query === lastSyncedQuery) return;
    lastSyncedQuery = query;
    input = query;
    term = query;
  });

  // Debounced typing: 200ms matches the room/thread search-input debounce.
  // NOTE: the input value must be read synchronously inside the effect —
  // Svelte 5 effects only track reads that happen during the effect run.
  $effect(() => {
    const value = input;
    const timer = setTimeout(() => {
      const next = value.trim();
      if (next !== term) {
        term = next;
      }
    }, 200);
    return () => clearTimeout(timer);
  });

  // ── Query ─────────────────────────────────────────────────────────────
  const scope = $derived<SearchScope>({
    ...(spaceId ? { spaceId: () => spaceId } : {}),
    ...(roomId ? { roomId: () => roomId } : {}),
  });

  const searchQuery = createSearchMessagesQuery(() => term, scope);

  // Flatten all pages into a single array; window-sliced cursors guarantee
  // hits never repeat across pages.
  const messages = $derived(
    searchQuery.data?.pages.flatMap((p) => p.messages) ?? [],
  );
  const hasMore = $derived(searchQuery.hasNextPage ?? false);

  // Room/thread name search (`space.roomy.search.rooms`), scoped to the
  // space when one is in context. Both endpoints are called for the same
  // term; the room results render above the message results. The directory
  // search has no space to scope room results to, and a thread-scoped
  // search is the thread alone (its parent channel isn't searched either),
  // so the query stays disabled in both cases.
  const roomsQuery = createSearchRoomsQuery(
    () => (disableRoomsSearch ? undefined : spaceId),
    () => term,
  );
  const rooms = $derived(roomsQuery.data?.rooms ?? []);

  // Deep-link for a room/thread result. Threads link with their canonical
  // parent channel as `?parent=` (the room page's thread breadcrumb), the
  // same convention the board views use.
  function roomHrefFor(r: RoomSearchResult): string {
    const parentParam =
      r.kind === "thread" && r.channelId ? `?parent=${r.channelId}` : "";
    return `/${spaceId!}/${r.id}${parentParam}`;
  }
  // ids of messages that begin a contiguous run in their space+room — the
  // location header is only rendered for these, so consecutive hits from the
  // same room share one header.
  const firstInRoom = $derived.by(() => {
    const ids = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const cur = messages[i];
      const prev = messages[i - 1];
      if (!cur) continue;
      const sameRoom =
        prev !== undefined &&
        prev.spaceId === cur.spaceId &&
        prev.roomId === cur.roomId;
      if (!sameRoom) ids.add(cur.id);
    }
    return ids;
  });

  // Auto-pagination sentinel: when the sentinel scrolls into view (200px
  // before the end), fetch the next page. Same pattern as BoardView.
  let sentinel: HTMLElement | undefined = $state();

  $effect(() => {
    const el = sentinel;
    if (!el || !hasMore) return;

    let fetching = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !fetching) {
          fetching = true;
          searchQuery.fetchNextPage();
          timer = setTimeout(() => {
            fetching = false;
          }, 500);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  });

  // Display names ride along on each result (spaceName/spaceAvatar/
  // roomName/roomKind) — the appserver denormalises them in-process, so no
  // getSpaceSummary/getRoomSummary round-trips are needed.
</script>

{#snippet locationHeader(m: SearchMessage)}
  <div class="flex items-center gap-1 px-3 pt-1.5 pb-1 text-xs text-base-500 dark:text-base-400">
    {#if showSpaceInfo}
      <span class="inline-flex items-center gap-1 min-w-0">
        <SpaceAvatar
          src={resolveBlobUrl(m.spaceAvatar)}
          id={m.spaceId}
          name={m.spaceName ?? m.spaceId}
          size={14}
        />
        <span class="truncate">{m.spaceName ?? m.spaceId}</span>
      </span>
      <IconChevronRight class="opacity-40 size-3 shrink-0" />
    {/if}
    <span class="inline-flex items-center gap-1 min-w-0">
      {#if m.roomKind === "thread"}
        <IconNeedleThread class="opacity-60 size-3.5 shrink-0" />
      {:else}
        <span class="opacity-60 shrink-0">#</span>
      {/if}
      <span class="truncate">{m.roomName ?? m.roomId}</span>
    </span>
  </div>
{/snippet}

<main class="h-full overflow-y-auto text-base-950 dark:text-base-50">
  <div class="flex flex-col items-center py-8 px-4">
    <div class="w-full max-w-2xl flex flex-col gap-4">
      <div class="relative">
        <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-400" />
        <input
          type="text"
          bind:value={input}
          placeholder={placeholder}
          aria-label={placeholder}
          class="w-full ring-1 ring-inset ring-base-300 dark:ring-base-700 focus:ring-2 focus:ring-accent-500 bg-base-100 dark:bg-base-800/50 focus:bg-accent-400/5 dark:focus:bg-accent-600/5 text-base-900 dark:text-base-100 placeholder:text-base-400 dark:placeholder:text-base-500 rounded-2xl pl-9 pr-3 py-2 text-sm font-medium outline-none border-0 transition-colors"
        />
      </div>

      {#if term.length >= 3 && rooms.length > 0}
        <section class="flex flex-col gap-2">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-base-400 dark:text-base-500">
            Rooms &amp; threads
          </h2>
          <ul class="flex flex-col gap-1">
            {#each rooms as r (r.id)}
              <li>
                <a
                  href={roomHrefFor(r)}
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-base-800 dark:text-base-200 hover:bg-base-100/70 dark:hover:bg-base-400/10"
                >
                  {#if r.kind === "thread"}
                    <IconNeedleThread class="size-4 shrink-0 text-base-400" />
                  {:else}
                    <IconHashtag class="size-4 shrink-0 text-base-400" />
                  {/if}
                  <span class="truncate">{r.name}</span>
                  {#if r.kind === "thread" && r.channelName}
                    <span class="text-xs text-base-400 shrink-0">
                      in {r.channelName}
                    </span>
                  {/if}
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if term.length === 0}
        <p class="text-sm text-base-400">Type to search {scopeLabel}.</p>
      {:else if term.length < 3}
        <p class="text-sm text-base-400">Type at least 3 characters to search.</p>
      {:else if searchQuery.isPending && !searchQuery.data}
        <p class="text-sm text-base-400">Searching…</p>
      {:else if searchQuery.isError}
        <ErrorMessage message={searchQuery.error.message} class="py-8" />
      {:else if searchQuery.data}
        {#if messages.length === 0}
          <p class="text-sm text-base-400">No messages found.</p>
        {:else}
          <div class="flex items-center justify-end gap-2">
            <span class="text-xs text-base-400 shrink-0">
              {messages.length} {messages.length === 1 ? "result" : "results"}
            </span>
          </div>

          <ul class="space-y-3">
            {#each messages as m (m.id)}
              {@const isForward = !!m.forwardedFrom}
              {@const original = m.forwardedFrom?.message}
              {@const replyPreview = m.reply?.message}
              {@const effBridged =
                m.authorDid.startsWith("did:discord:") ||
                (original?.authorDid.startsWith("did:discord:") ?? false)}
              {@const replyBridged = replyPreview?.authorDid.startsWith("did:discord:") ?? false}
              {@const replyPreviewContent =
                replyPreview?.forwardedFrom?.message?.content ??
                replyPreview?.content ??
                ""}
              {@const replyPreviewMime =
                replyPreview?.forwardedFrom?.message?.mimeType ??
                replyPreview?.mimeType}
              <li>
                <!-- Results render with the same MessageBubble the chat
                     area uses. The whole row navigates to the room; inner
                     interactive elements (avatar, links, reactions) are
                     skipped. -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  role="link"
                  tabindex="0"
                  class="rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 hover:bg-base-100/50 dark:hover:bg-base-400/5"
                  onclick={(e) => {
                    if ((e.target as Element)?.closest?.("a,button,[role=button]")) return;
                    goto(hrefFor(m));
                  }}
                  onkeydown={(e) => {
                    if ((e.target as Element)?.closest?.("a,button,[role=button]")) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goto(hrefFor(m));
                    }
                  }}
                >
                  <!-- Where the result lives. Rendered above the message so
                       the hit reads like a regular message in context. Merge
                       contiguous hits in the same room under one header. -->
                  {#if firstInRoom.has(m.id)}
                    {@render locationHeader(m)}
                  {/if}

                  <MessageBubble
                    compact
                    authorDid={original ? original.authorDid : m.authorDid}
                    authorName={original ? (original.authorName ?? undefined) : (m.authorName ?? undefined)}
                    authorHandle={original ? (original.authorHandle ?? undefined) : (m.authorHandle ?? undefined)}
                    authorAvatarUrl={original ? (original.authorAvatar ?? undefined) : (m.authorAvatar ?? undefined)}
                    avatarSrc={original ? resolveBlobUrl(original.authorAvatar) : resolveBlobUrl(m.authorAvatar)}
                    profileUrl={effBridged ? undefined : `/user/${original ? original.authorDid : m.authorDid}`}
                    onAvatarClick={effBridged ? undefined : () => goto(`/user/${original ? original.authorDid : m.authorDid}`)}
                    timestamp={new Date(original ? original.timestamp : m.timestamp)}
                    isBridged={effBridged}
                    isSystem={m.system === true}
                  >
                    {#snippet replyContext()}
                      {#if m.forwardedFrom}
                        <ForwardContext
                          name={m.authorName}
                          did={m.authorDid}
                          avatar={m.authorAvatar}
                          timestamp={new Date(m.timestamp)}
                          spaceId={m.spaceId}
                          roomId={m.forwardedFrom.roomId}
                          messageId={m.forwardedFrom.messageId}
                        />
                      {:else if m.replyTo}
                        {#if replyPreview}
                          <div class="flex gap-1 items-center shrink-0">
                            <IconReplyLine
                              width="28px"
                              height="12px"
                              class="relative -bottom-1 ml-2 mr-1 left-0.75 stroke-black/25 dark:stroke-white/50 dark:stroke-1"
                            />
                            {#if replyPreview.authorAvatar || replyPreview.authorDid}
                              {#if replyBridged}
                                <div class="w-4 h-4 rounded-full shrink-0">
                                  <UserAvatar
                                    src={resolveBlobUrl(replyPreview.authorAvatar)}
                                    name={replyPreview.authorDid || ""}
                                    size={16}
                                    class="w-4 h-4"
                                  />
                                </div>
                              {:else}
                                <button
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    goto(`/user/${replyPreview.authorDid}`);
                                  }}
                                  class="w-4 h-4 rounded-full shrink-0 hover:ring-2 hover:ring-accent-500 transition-all cursor-pointer"
                                >
                                  <UserAvatar
                                    src={resolveBlobUrl(replyPreview.authorAvatar)}
                                    name={replyPreview.authorDid || ""}
                                    size={16}
                                    class="w-4 h-4"
                                  />
                                </button>
                              {/if}
                            {/if}
                            {#if replyBridged}
                              <span class="font-medium text-accent-700 dark:text-accent-300">
                                {replyPreview.authorName || replyPreview.authorDid.slice(0, 12)}
                              </span>
                            {:else}
                              <a
                                href={`/user/${replyPreview.authorDid}`}
                                class="font-medium text-accent-700 dark:text-accent-300 hover:underline"
                              >{replyPreview.authorName || replyPreview.authorDid.slice(0, 12)}</a
                              >
                            {/if}
                          </div>
                          <div class="flex items-center gap-1 italic">
                            {#if replyPreview.forwardedFrom}
                              <IconForward class="size-3.5 shrink-0 text-base-500 dark:text-base-400" />
                            {/if}
                            <span class="line-clamp-1 overflow-hidden">
                              {@html messageContentToPlaintext(replyPreviewContent, replyPreviewMime)}
                            </span>
                          </div>
                        {:else}
                          <span class="italic text-base-400">Reply unavailable</span>
                        {/if}
                      {/if}
                    {/snippet}

                    {#snippet content()}
                      {#if isForward}
                        {#if original}
                          <MessageContent content={original.content} mimeType={original.mimeType} />
                        {:else}
                          <span class="italic text-base-400 text-sm">Original message unavailable</span>
                        {/if}
                      {:else}
                        <MessageContent content={m.content} mimeType={m.mimeType} />
                      {/if}
                    {/snippet}

                    {#snippet linkEmbeds()}
                      {@const embeds = (isForward ? original?.linkEmbeds : m.linkEmbeds) ?? []}
                      {#if embeds.some((l) => l.embed)}
                        <div class="flex flex-col gap-2 mt-1">
                          {#each embeds.filter((l) => l.embed) as link (link.url)}
                            <LinkCard url={link.url} embed={link.embed} />
                          {/each}
                        </div>
                      {/if}
                    {/snippet}

                    {#snippet media()}
                      {@const media = (isForward ? original?.media : m.media) ?? []}
                      {#if media.some((item) => !item.type.startsWith("text/"))}
                        <MediaEmbed
                          media={media
                            .filter((item) => !item.type.startsWith("text/"))
                            .map((item) => ({ ...item, alt: item.alt ?? undefined }))}
                        />
                      {/if}
                    {/snippet}

                    {#snippet reactions()}
                      {#if m.reactions.length > 0}
                        <MessageReactions
                          spaceId={m.spaceId}
                          roomId={m.roomId}
                          messageId={m.id}
                          reactions={m.reactions}
                          currentUserDid={auth.userDid}
                        />
                      {/if}
                    {/snippet}
                  </MessageBubble>

                  {#if isForward && m.content}
                    <!-- The forwarder's own note, below the forwarded
                         original — same as the chat area. -->
                    <div class="mt-1">
                      <MessageBubble
                        authorDid={m.authorDid}
                        authorName={m.authorName ?? undefined}
                        authorHandle={m.authorHandle ?? undefined}
                        authorAvatarUrl={m.authorAvatar ?? undefined}
                        avatarSrc={resolveBlobUrl(m.authorAvatar)}
                        profileUrl={m.authorDid.startsWith("did:discord:") ? undefined : `/user/${m.authorDid}`}
                        onAvatarClick={m.authorDid.startsWith("did:discord:") ? undefined : () => goto(`/user/${m.authorDid}`)}
                        timestamp={new Date(m.timestamp)}
                      >
                        {#snippet content()}
                          <MessageContent content={m.content} mimeType={m.mimeType} />
                        {/snippet}
                      </MessageBubble>
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>

          {#if hasMore}
            <div
              bind:this={sentinel}
              class="flex items-center justify-center py-4"
            >
              <div class="text-sm text-base-400">
                {searchQuery.isFetchingNextPage ? "Loading more…" : "Scroll for more"}
              </div>
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
</main>
