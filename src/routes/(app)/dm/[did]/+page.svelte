<script lang="ts">
  import type { Autodoc } from "$lib/autodoc.svelte";
  import ChatArea from "$lib/components/ChatArea.svelte";
  import { g } from "$lib/global.svelte";
  import type { Channel } from "$lib/schemas/types";
  import { page } from "$app/state";
  import { user } from "$lib/user.svelte";
  import { onDestroy } from "svelte";

  let channel: Autodoc<Channel> | undefined = $derived(g.dms[page.params.did]);

  let input = $state("");

  function sendMessage(e: SubmitEvent) {
    e.preventDefault();
    if (!channel) return;

    channel.change((doc) => {
      doc.messages.push({
        content: input,
        timestamp: Date.now(),
        user: {
          did: user.agent?.assertDid!,
          handle: user.profile.data?.handle!,
          avatar: user.profile.data?.avatar!
        },
      });
    });

    input = "";
  }

  let interval = setInterval(() => {
    channel.loadFromStorage();
  }, 2000);

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

{#if channel}
  <ChatArea {channel} />
{/if}

<form onsubmit={sendMessage}>
  <input
    type="text"
    class="w-full px-4 py-2 rounded-lg bg-violet-900 flex-none text-white"
    placeholder="Say something..."
    bind:value={input}
  />
</form>