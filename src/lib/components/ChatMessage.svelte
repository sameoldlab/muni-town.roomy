<script lang="ts">
  import { renderMarkdownSanitized } from "$lib/markdown";
  import type { ChatEvent } from "$lib/schemas/types";
  import { AvatarBeam } from "svelte-boring-avatars";
  let { event }: { event: ChatEvent } = $props();
</script>

<li class="w-full h-fit flex gap-4">
  <AvatarBeam name={event.user.handle} />
  <div class="flex flex-col gap-2 text-white">
    <section class="flex gap-2">
      <h5 class="font-bold">{event.user.handle}</h5>
      <time class="text-zinc-400">
        {new Date(event.timestamp).toLocaleString()}
      </time>
    </section>
    <p class="text-lg">{@html renderMarkdownSanitized(event.content)}</p>
  </div>
</li>
