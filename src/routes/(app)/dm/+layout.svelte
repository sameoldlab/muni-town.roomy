<script lang="ts">
  import { ToggleGroup } from "bits-ui";

  import { user } from "$lib/user.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";

  let { children } = $props();

  let index = $derived(user.index.value);

  let dms = $derived(
    Object.entries($index?.dms || {}).map(([did, _doc]) => ({
      id: did,
      name: did,
    })),
  );
</script>

<!-- Room Selector; TODO: Sub Menu (eg Settings) -->
<nav class="flex flex-col gap-4 p-4 h-full w-72 bg-violet-950 rounded-lg">
  <h1 class="text-2xl font-extrabold text-white px-2 py-1 text-ellipsis">
    Direct Messages
  </h1>
  <hr />

  <!-- Channels -->
  <ToggleGroup.Root type="single" class="flex flex-col gap-4 items-center">
    {#each dms as dm}
      <ToggleGroup.Item
        onclick={() => goto(`/dm/${dm.id || ""}`)}
        value={dm.id}
        class="w-full text-start hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5 border border-transparent data-[state=on]:border-white data-[state=on]:scale-98 data-[state=on]:bg-white/5 text-white px-4 py-2 rounded-md"
      >
        <h3>{dm.name}</h3>
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</nav>

<!-- Events/Room Content -->
<main class="grow flex flex-col gap-4 bg-violet-950 rounded-lg p-4">
  <section class="flex flex-none justify-between border-b-1 pb-4">
    <h4 class="text-white text-lg font-bold">{page.params.handle}</h4>
  </section>

  {@render children()}
</main>
