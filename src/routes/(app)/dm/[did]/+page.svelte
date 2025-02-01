<script lang="ts">
  import type { Autodoc } from "$lib/autodoc.svelte";
  import ChatArea from "$lib/components/ChatArea.svelte";
  import { g } from "$lib/global.svelte";
  import type { Channel, ChatEvent } from "$lib/schemas/types";
  import { page } from "$app/state";
  import { user } from "$lib/user.svelte";
  import { onDestroy, setContext } from "svelte";
  import { Avatar, Button, Tabs, Toggle } from "bits-ui";
  import { AvatarBeam } from "svelte-boring-avatars";
  import Icon from "@iconify/svelte";

  let tab = $state("chat");
  let channel: Autodoc<Channel> | undefined = $derived(g.dms[page.params.did]);
  let messageInput = $state("");
  let info = $derived(g.catalog?.view.dms[page.params.did]);

  // thread maker
  let isThreading = $state({ value: false });
  let selectedMessages: ChatEvent[] = $state([]);
  setContext("isThreading", isThreading);
  setContext("selectMessage", (event: ChatEvent) => {
    selectedMessages.push(event);
  });
  setContext("removeSelectedMessage", (event: ChatEvent) => {
    selectedMessages = selectedMessages.filter((m) => JSON.stringify(m) !== JSON.stringify(event));
  });

  $inspect({ selectedMessages });

  $effect(() => {
    if (!isThreading.value) { selectedMessages = []; }
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

<header class="flex flex-none items-center justify-between border-b-1 pb-4">
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

  <Tabs.Root bind:value={tab}>
    <Tabs.List class="grid grid-cols-2 gap-4 border text-white p-1 rounded">
      <Tabs.Trigger value="chat" class="flex gap-2 w-full justify-center transition-all duration-150 items-center px-4 py-1 data-[state=active]:bg-violet-800 rounded">
        <Icon icon="tabler:message" color="white"  class="text-2xl" />
        <p>Chat</p>
      </Tabs.Trigger>
      <Tabs.Trigger value="threads" class="flex gap-2 w-full justify-center transition-all duration-150 items-center px-4 py-1 data-[state=active]:bg-violet-800 rounded">
        <Icon icon="material-symbols:thread-unread-rounded" color="white"  class="text-2xl" />
        <p>Threads</p>
      </Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>

  <menu class="flex items-center">
    <Toggle.Root bind:pressed={isThreading.value} class={`p-2 ${isThreading.value && "bg-white/10"} hover:scale-105 active:scale-95 transition-all duration-150 rounded`}> 
      <Icon icon="tabler:needle-thread" color="white" class="text-2xl" />
    </Toggle.Root>
    <Button.Root class="p-2 hover:scale-105 active:scale-95 transition-all duration-150">
      <Icon icon="basil:settings-alt-solid" color="white" class="text-2xl" />
    </Button.Root>
  </menu>
</header>

{#if tab === "chat"}
  {#if channel}
    <ChatArea {channel} />
    <form onsubmit={sendMessage}>
      <input
        type="text"
        class="w-full px-4 py-2 rounded-lg bg-violet-900 flex-none text-white"
        placeholder="Say something..."
        bind:value={messageInput}
      />
    </form>
  {/if}
{/if}

<!-- TODO: Render Threads -->
{#if tab === "threads"}
  <p>Threads</p>
{/if}
