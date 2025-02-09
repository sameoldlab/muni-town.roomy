<script lang="ts">
  import { page } from "$app/state";
  import ChatArea from "$lib/components/ChatArea.svelte";
  import { g } from "$lib/global.svelte";

  let space = $derived(g.spaces[page.params.space]);
</script>

<ChatArea source={{ type: "space", space, channelId: page.params.channel }} />

<input
  type="text"
  class="w-full px-4 py-2 rounded-lg bg-violet-900 flex-none"
  placeholder="Say something..."
/>
