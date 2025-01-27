<script lang="ts">
  import { ScrollArea } from "bits-ui";
  import { AvatarBeam } from "svelte-boring-avatars";

  // TODO: use Matrix spec for MessageEvent
  type MessageEvent = {
    content: string;
    timestamp: number;
    user: {
      name: string;
    };
  };

  const messages = [
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" },
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" },
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" },
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" },
    },
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" },
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" },
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" },
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" },
    },
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" },
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" },
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" },
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" },
    },
  ];

  // ScrollArea
  let viewport: HTMLDivElement | undefined = $state();

  // Go to the end of the ScrollArea
  $effect(() => {
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  });
</script>

{#snippet messageEventDisplay(event: MessageEvent)}
  <li class="w-full h-fit flex gap-4">
    <AvatarBeam name={event.user.name} />
    <div class="flex flex-col gap-2 text-white">
      <section class="flex gap-2">
        <h5 class="font-bold">{event.user.name}</h5>
        <time class="text-zinc-400"
          >{new Date(event.timestamp).toLocaleString()}</time
        >
      </section>
      <p class="text-lg">{event.content}</p>
    </div>
  </li>
{/snippet}

<ScrollArea.Root>
  <ScrollArea.Viewport bind:el={viewport} class="w-full h-full">
    <ScrollArea.Content>
      <ol class="flex flex-col gap-8">
        {#each messages as message}
          {@render messageEventDisplay(message)}
        {/each}
      </ol>
    </ScrollArea.Content>
  </ScrollArea.Viewport>
  <ScrollArea.Scrollbar
    orientation="vertical"
    class="flex h-full w-2.5 touch-none select-none rounded-full border-l border-l-transparent p-px transition-all hover:w-3 hover:bg-dark-10"
  >
    <ScrollArea.Thumb
      class="relative flex-1 rounded-full bg-muted-foreground opacity-40 transition-opacity hover:opacity-100"
    />
  </ScrollArea.Scrollbar>
  <ScrollArea.Corner />
</ScrollArea.Root>

<input
  type="text"
  class="w-full px-4 py-2 rounded-lg bg-violet-900 flex-none"
  placeholder="Say something..."
/>