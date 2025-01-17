<script lang="ts">
	import '../app.css';
  import Icon from "@iconify/svelte";
  import { AvatarPixel } from 'svelte-boring-avatars';
  import { Avatar, Button, ToggleGroup } from "bits-ui";

	let { children } = $props();

  // TODO: set servers/rooms based on user
  let servers = ["muni", "barrel_of_monkeys", "offishal"]
  let currentServer: string = $state("muni");
</script>

<!-- Container -->
<div class="flex gap-8 p-4 bg-violet-900 w-screen h-screen">

  <!-- Server Bar -->
  <aside class="flex flex-col justify-between w-20 h-full bg-violet-950 rounded-lg px-4 py-8 items-center">
    <ToggleGroup.Root 
      bind:value={currentServer}
      type="single"
      class="flex flex-col gap-4 items-center"
    > 
      {#each servers as server}
        <ToggleGroup.Item 
          value={server} 
          class="capitalize hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5 border border-transparent data-[state=on]:border-white data-[state=on]:scale-98 data-[state=on]:bg-white/5 text-white p-4 rounded-md"
        >
          {server[0]} 
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

  <!-- Room Selector -->
  <nav>

  </nav>

  <!-- Events/Room Content -->
  <main>

  </main>

</div>
