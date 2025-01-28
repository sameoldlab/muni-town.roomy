<script lang="ts">
  import Icon from "@iconify/svelte";
  import { Accordion, ToggleGroup } from "bits-ui";

  import { slide } from "svelte/transition";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";

  let { children } = $props();

  // TODO: set current channel on url based on server
  let categories = $derived([
    {
      id: "456",
      name: "Internal",
      channels: [
        { id: "zxc", name: "dev-tools" },
        { id: "jkl", name: "releases" },
        { id: "rty", name: "gh-bot" },
      ],
    },
    {
      id: "789",
      name: "Content",
      channels: [
        { id: "iop", name: "blogs" },
        { id: "bnm", name: "drafts" },
        { id: "cvb", name: "suggestions" },
      ],
    },
  ]);
</script>

<!-- Room Selector; TODO: Sub Menu (eg Settings) -->
<nav class="flex flex-col gap-4 p-4 h-full w-72 bg-violet-950 rounded-lg">
  <h1 class="text-2xl font-extrabold text-white px-2 py-1 text-ellipsis">
    {page.params.space}
  </h1>
  <hr />

  <!-- Category and Channels -->
  <Accordion.Root multiple class="flex flex-col gap-4 w-full text-white">
    {#each categories as category}
      <Accordion.Item value={category.id}>
        <Accordion.Header>
          <Accordion.Trigger
            class="w-full flex justify-between items-center px-2 py-4 rounded-lg hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5"
          >
            <h2>{category.name}</h2>
            <Icon icon="ph:caret-up-down-bold" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content transition={slide}>
          <hr class="mb-4" />
          <ToggleGroup.Root
            type="single"
            class="flex flex-col gap-4 items-center"
          >
            {#each category.channels as channel}
              <ToggleGroup.Item
                onclick={() =>
                  goto(`/space/${page.params.space}/${channel.id}`)}
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
<main class="grow flex flex-col gap-4 bg-violet-950 rounded-lg p-4">
  <section class="flex flex-none justify-between border-b-1 pb-4">
    <h4 class="text-white text-lg font-bold">{page.params.space}</h4>
  </section>

  {@render children()}
</main>
