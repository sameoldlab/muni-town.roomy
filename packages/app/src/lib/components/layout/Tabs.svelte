<script lang="ts">
  import { Tabs } from "bits-ui";
  // using a binding for active
  // `bind:active={activeTab}` instead of `active={activeTab}`
  // has the same result in without needing an effect.
  // did not fully check how this affects browser history
  let {
    items,
    active = $bindable(),
  }: {
    items: { name: string; href: string }[];
    active: string;
  } = $props();
</script>

<Tabs.Root bind:value={active}>
  <Tabs.List
    class="rounded-[12px] bg-base-200/50 dark:bg-base-900/50 grid grid-cols-{items.length} p-[2px] text-sm border border-base-800/10 dark:border-base-100/10"
  >
    {#each items as { name, href }}
      <a {href}>
        <Tabs.Trigger
          value={name}
          class="px-2 py-1 cursor-pointer w-full opacity-60 data-[state=active]:opacity-100 rounded-[10px] bg-transparent data-[state=active]:bg-base-200 dark:data-[state=active]:bg-base-900 transition-colors duration-75 ease-out"
        >
          {name}
        </Tabs.Trigger>
      </a>
    {/each}
  </Tabs.List>
</Tabs.Root>
