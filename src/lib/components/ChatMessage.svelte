<script lang="ts">
  import { Avatar, Tooltip } from "bits-ui";
  import type { Message, Ulid } from "$lib/schemas/types";
  import { renderMarkdownSanitized } from "$lib/markdown";
  import { AvatarBeam } from "svelte-boring-avatars";
  import { format, formatDistanceToNowStrict } from "date-fns";
  import { fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { decodeTime } from "ulidx";

  let { id, message }: { id: Ulid; message: Message } = $props();
  let isSelected = $state(false);
  let isThreading: { value: boolean } = getContext("isThreading");
  const selectMessage: (message: Ulid) => void = getContext("selectMessage");
  const removeSelectedMessage: (message: Ulid) => void = getContext(
    "removeSelectedMessage",
  );

  function updateSelect() {
    if (isSelected) {
      selectMessage(id);
    } else {
      removeSelectedMessage(id);
    }
  }

  $effect(() => {
    if (!isThreading.value) {
      isSelected = false;
    }
  });
</script>

<li
  class="relative w-full h-fit flex gap-4 hover:bg-white/5 px-2 py-2.5 transition-all duration-75"
>
  <Avatar.Root class="w-12">
    <Avatar.Image src={message.author} class="rounded-full" />
    <Avatar.Fallback>
      <AvatarBeam name={message.author} />
    </Avatar.Fallback>
  </Avatar.Root>

  <div class="flex flex-col gap-2 text-white">
    <section class="flex gap-2">
      <h5 class="font-bold">{message.author}</h5>
      <Tooltip.Root openDelay={300}>
        <Tooltip.Trigger>
          <time class="text-zinc-400 cursor-context-menu">
            {formatDistanceToNowStrict(new Date(decodeTime(id)))}
          </time>
        </Tooltip.Trigger>
        <Tooltip.Content
          transition={fly}
          transitionConfig={{ y: 8, duration: 150 }}
          sideOffset={8}
        >
          <time
            class="flex items-center justify-center rounded-input border border-dark-10 bg-white p-3 text-sm font-medium shadow-popover outline-none"
          >
            {format(new Date(decodeTime(id)), "MM/dd/yyyy K:mm:ss aaa")}
          </time>
        </Tooltip.Content>
      </Tooltip.Root>
    </section>
    <p class="text-lg">{@html renderMarkdownSanitized(message.content)}</p>
  </div>

  {#if isThreading.value}
    <input
      type="checkbox"
      onchange={updateSelect}
      bind:checked={isSelected}
      class="absolute right-4 inset-y-0"
    />
  {/if}
</li>
