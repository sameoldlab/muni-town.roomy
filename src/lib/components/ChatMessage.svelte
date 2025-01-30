<script lang="ts">
  import { AvatarBeam } from "svelte-boring-avatars";
  let { event }: { event: ChatEvent } = $props();
</script>

<li class="w-full h-fit flex gap-4">
  <AvatarBeam name={event.user.name} />
  <div class="flex flex-col gap-2 text-white">
    <section class="flex gap-2">
      <h5 class="font-bold">{event.user.name}</h5>
      <time class="text-zinc-400">
        {new Date(event.timestamp).toLocaleString()}
      </time>
    </section>
    <p class="text-lg">{event.content}</p>
  </div>
</li>