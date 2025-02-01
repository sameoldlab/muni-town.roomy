<script lang="ts">
  import type { Autodoc } from "$lib/autodoc.svelte";
  import ChatArea from "$lib/components/ChatArea.svelte";
  import { g } from "$lib/global.svelte";
  import type { Channel, ChatEvent } from "$lib/schemas/types";
  import { page } from "$app/state";
  import { user } from "$lib/user.svelte";
  import { onDestroy, setContext } from "svelte";
  import { Avatar, Button } from "bits-ui";
  import { AvatarBeam } from "svelte-boring-avatars";
  import Icon from "@iconify/svelte";

  let channel: Autodoc<Channel> | undefined = $derived(g.dms[page.params.did]);
  let messageInput = $state("");
  let info = $derived(g.catalog?.view.dms[page.params.did]);

  // thread maker
  let selectedMessages: ChatEvent[] = $state([]);
  setContext("selectMessage", (event: ChatEvent) => {
    selectedMessages.push(event);
  });
  setContext("removeSelectedMessage", (event: ChatEvent) => {
    selectedMessages.filter((m) => m !== event);
  });

  function sendMessage(e: SubmitEvent) {
    e.preventDefault();
    if (!channel) return;

    channel.change((doc) => {
      doc.messages.push({
        content: messageInput,
        timestamp: Date.now(),
        user: {
          did: user.agent?.assertDid!,
          handle: user.profile.data?.handle!,
          avatar: user.profile.data?.avatar!
        },
      });
    });

    messageInput = "";
  }

  // sync channel every 2 seconds
  let interval = setInterval(() => {
    channel.loadFromStorage();
  }, 2000);

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<section class="flex flex-none items-center justify-between border-b-1 pb-4">
  <div class="flex gap-4 items-center">
    <Avatar.Root class="w-8">
      <Avatar.Image src={info?.avatar} class="rounded-full" />
      <Avatar.Fallback>
        <AvatarBeam name={info?.name} />
      </Avatar.Fallback>
    </Avatar.Root>
    <h4 class="text-white text-lg font-bold">
      {info?.name}
    </h4>
  </div>

  <menu>
    <Button.Root class="hover:scale-105 active:scale-95 transition-all duration-150">
      <Icon icon="tabler:message-cog" color="white"  class="text-2xl" />
    </Button.Root>
  </menu>
</section>

{#if channel}
  <ChatArea {channel} />
{/if}

<form onsubmit={sendMessage}>
  <input
    type="text"
    class="w-full px-4 py-2 rounded-lg bg-violet-900 flex-none text-white"
    placeholder="Say something..."
    bind:value={messageInput}
  />
</form>