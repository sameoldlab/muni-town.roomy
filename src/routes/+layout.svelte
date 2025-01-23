<script lang="ts">
	import '../app.css';
  import Icon from "@iconify/svelte";
  import { userStore } from '$lib/user.svelte';
  import { fade, slide } from 'svelte/transition';
  import { AvatarPixel } from 'svelte-boring-avatars';
  import type { OAuthSession } from '@atproto/oauth-client-browser';
  import { Accordion, Avatar, Button, Dialog, Separator, ToggleGroup } from "bits-ui";

	let { children } = $props();

  let handleInput = $state("");

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
      <Dialog.Root>
        <Dialog.Trigger class="hover:scale-105 active:scale-95 transition-all duration-150">
          <Avatar.Root>
            <!-- TODO: set images based on user -->
            <Avatar.Image />
            <Avatar.Fallback>
              <AvatarPixel name="pigeon" />
            </Avatar.Fallback>
          </Avatar.Root>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            transition={fade}
            transitionConfig={{ duration: 150 }}
            class="fixed inset-0 z-50 bg-black/80"
          />
          <Dialog.Content>
            <Dialog.Title>User</Dialog.Title>
            <Separator.Root />
            {#if userStore.session}
              <p>Logged in as {(userStore.session as OAuthSession).did}</p>
            {:else}
              <section>
                <input type="url" class="w-full" bind:value={handleInput} />
                <Button.Root onclick={() => userStore.loginWithHandle(handleInput)}>
                  Login
                </Button.Root>
              </section>
            {/if}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
  <main class="relative flex flex-grow items-stretch flex-col gap-4 bg-violet-950 rounded-lg p-4">
    <section class="flex justify-between">
      <h4 class="text-white text-lg font-bold">{currentChannel.name}</h4>
    </section>
    <hr />
    {@render children()}
  </main>
</div>
