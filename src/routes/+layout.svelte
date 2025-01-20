<script lang="ts">
	import '../app.css';
  import Icon from "@iconify/svelte";
  import { AvatarBeam, AvatarPixel } from 'svelte-boring-avatars';
  import { Accordion, Avatar, Button, ScrollArea, ToggleGroup } from "bits-ui";
  import { slide } from 'svelte/transition';
    import { tick } from 'svelte';

	let { children } = $props();

  // TODO: set servers/rooms based on user
  let servers = ["muni", "barrel_of_monkeys", "offishal"]
  let currentServer: string = $state("muni");

  // TODO: set current channel on url based on server
  let categories = [
    {
      id: "123",
      name: "Information", 
      channels: [
        { id: "abc", name: "general" },
        { id: "xyz", name: "announcements" },
        { id: "qwe", name: "introductions" }
      ]
    },
    {
      id: "456",
      name: "Internal", 
      channels: [
        { id: "zxc", name: "dev-tools" },
        { id: "jkl", name: "releases" },
        { id: "rty", name: "gh-bot" }
      ]
    },
    {
      id: "789",
      name: "Content", 
      channels: [
        { id: "iop", name: "blogs" },
        { id: "bnm", name: "drafts" },
        { id: "cvb", name: "suggestions" }
      ]
    }
  ];

  let currentChannel: { id: string, name: string } = $state(
    { id: "abc", name: "general" }
  );

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
      user: { name: "alice" }
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" }
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" }
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" }
    },
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" }
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" }
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" }
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" }
    },
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" }
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" }
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" }
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" }
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

<!-- Container -->
<div class="flex gap-4 p-4 bg-violet-900 w-screen h-screen">

  <!-- Server Bar -->
  <aside class="flex flex-col justify-between w-20 h-full bg-violet-950 rounded-lg px-4 py-8 items-center">
    <ToggleGroup.Root 
      bind:value={currentServer}
      type="single"
      class="flex flex-col gap-4 items-center"
    > 
      {#each servers as server}
        <ToggleGroup.Item 
          onclick={() => currentServer = server}
          value={server} 
          class="capitalize hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5 border border-transparent data-[state=on]:border-white data-[state=on]:scale-98 data-[state=on]:bg-white/5 text-white p-4 rounded-md"
        >
          <Avatar.Root>
            <!-- TODO: set images based on server -->
            <Avatar.Image />
            <Avatar.Fallback>
              <AvatarPixel name={server} />
            </Avatar.Fallback>
          </Avatar.Root>
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>

    <section class="flex flex-col gap-8 items-center">
      <Button.Root class="hover:scale-105 active:scale-95 transition-all duration-150">
        <Icon icon="basil:settings-alt-solid" color="white" class="text-2xl" />
      </Button.Root>
      <Button.Root class="hover:scale-105 active:scale-95 transition-all duration-150">
        <Avatar.Root>
          <!-- TODO: set images based on user -->
          <Avatar.Image />
          <Avatar.Fallback>
            <AvatarPixel name="pigeon" />
          </Avatar.Fallback>
        </Avatar.Root>
      </Button.Root>
    </section>
  </aside>

  <!-- Room Selector; TODO: Sub Menu (eg Settings) -->
  <nav class="flex flex-col gap-4 p-4 h-full w-72 bg-violet-950 rounded-lg">
    <h1 class="text-2xl font-extrabold text-white px-2 py-1 text-ellipsis">{currentServer}</h1>
    <hr />

    <!-- Category and Channels -->
    <Accordion.Root multiple class="flex flex-col gap-4 w-full text-white">
      {#each categories as category}
        <Accordion.Item value={category.id}>
          <Accordion.Header>
            <Accordion.Trigger class="w-full flex justify-between items-center px-2 py-4 rounded-lg hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5">
              <h2>{category.name}</h2>
              <Icon icon="ph:caret-up-down-bold" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content transition={slide}>
            <hr class="mb-4" />
            <ToggleGroup.Root 
              bind:value={currentChannel.id}
              type="single"
              class="flex flex-col gap-4 items-center"
            > 
              {#each category.channels as channel}
                <ToggleGroup.Item 
                  onclick={() => currentChannel = channel}
                  value={channel.id} 
                  class="w-full text-start hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5 border border-transparent data-[state=on]:border-white data-[state=on]:scale-98 data-[state=on]:bg-white/5 text-white px-4 py-2 rounded-md"
                >
                  <h3>{channel.name}</h3>
                </ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    </Accordion.Root>
  </nav>

  <!-- Events/Room Content -->
  <main class="relative flex flex-grow flex-col gap-4 bg-violet-950 rounded-lg p-4">
    <section class="flex justify-between">
      <h4 class="text-white text-lg font-bold">{currentChannel.name}</h4>
    </section>
    <hr />
    
    {#snippet messageEventDisplay(event: MessageEvent)}
      <li class="w-full h-fit flex gap-4">
        <AvatarBeam name={event.user.name} />
        <div class="flex flex-col gap-2 text-white">
          <section class="flex gap-2">
            <h5 class="font-bold">{event.user.name}</h5>
            <time class="text-zinc-400">{new Date(event.timestamp).toLocaleString()}</time>
          </section>
          <p class="text-lg">{event.content}</p>
        </div>
      </li>
    {/snippet}
    
    <ScrollArea.Root class="relative"> 
      <ScrollArea.Viewport bind:el={viewport} class="w-full h-full">
        <ScrollArea.Content> 
          <ol class="flex flex-col gap-8 justify-end">
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

    <input type="text" class="w-full px-4 py-2 rounded-lg bg-violet-900" placeholder="Say something..." />

    {@render children()}
  </main>
</div>
