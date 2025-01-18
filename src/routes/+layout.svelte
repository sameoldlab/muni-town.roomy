<script lang="ts">
	import '../app.css';
  import Icon from "@iconify/svelte";
  import { AvatarPixel } from 'svelte-boring-avatars';
  import { Avatar, Button, Collapsible, ToggleGroup } from "bits-ui";
    import { slide } from 'svelte/transition';

	let { children } = $props();

  // TODO: set servers/rooms based on user
  let servers = ["muni", "barrel_of_monkeys", "offishal"]
  let currentServer: string = $state("muni");

  // TODO: set current channel on url based on server
  let channels = [
    { id: "abc", name: "general" },
    { id: "xyz", name: "announcements" },
    { id: "qwe", name: "introductions" }
  ];
  let currentChannel: string = $state("abc");
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
    <Collapsible.Root>
      <Collapsible.Trigger class="flex w-full text-white items-center justify-between hover:bg-white/5 p-2 rounded-lg active:scale-95 hover:scale-105 transition-all duration-150">
        <h2 class="font-bold">Information</h2>
        <Icon icon="ph:caret-up-down-bold" />
      </Collapsible.Trigger>
      <Collapsible.Content transition={slide}>
        <hr class="mt-2"/>
        <ToggleGroup.Root 
          bind:value={currentChannel}
          type="single"
          class="flex flex-col gap-4 items-center py-4"
        > 
          {#each channels as channel}
            <ToggleGroup.Item 
              onclick={() => currentChannel = channel.id}
              value={channel.id} 
              class="w-full text-white/50 text-start hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5 border border-transparent data-[state=on]:border-white data-[state=on]:scale-98 data-[state=on]:bg-white/5 data-[state=on]:text-white text-white p-2 rounded-md"
            >
              <h3>{channel.name}</h3>
            </ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      </Collapsible.Content>
    </Collapsible.Root>
  </nav>

  <!-- Events/Room Content; TODO: Setting content -->
  <main class="flex flex-grow bg-violet-950 rounded-lg">
    {@render children()}
  </main>

</div>
