<script lang="ts">
  import { Avatar } from "bits-ui";
  import type { ChatEvent } from "$lib/schemas/types";
  import { renderMarkdownSanitized } from "$lib/markdown";
  import { AvatarBeam } from "svelte-boring-avatars";

  let { event }: { event: ChatEvent } = $props();
</script>

<li class="w-full h-fit flex gap-4">
  <Avatar.Root class="w-12">
    <Avatar.Image src={event.user.avatar} class="rounded-full" />
    <Avatar.Fallback>
      <AvatarBeam name={event.user.handle} />
    </Avatar.Fallback>
  </Avatar.Root>

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