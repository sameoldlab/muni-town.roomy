<script lang="ts">
  import _ from "underscore";
  import { page } from "$app/state";
  import { setContext } from "svelte";
  import { goto } from "$app/navigation";
  import { outerWidth } from "svelte/reactivity/window";

  import Icon from "@iconify/svelte";
  import ChatArea from "$lib/components/ChatArea.svelte";
  import AvatarImage from "$lib/components/AvatarImage.svelte";
  import { Button } from "bits-ui";
  import { parseLinks } from "$lib/utils.svelte";
  import { g } from "$lib/global.svelte";
  import { Channel, Image, Timeline } from "@roomy-chat/sdk";

  let isMobile = $derived((outerWidth.current ?? 0) < 640);

  setContext("isThreading", false)
</script>

<header class="navbar">
  <div class="navbar-start flex gap-4">
    {#if g.channel}
      {#if isMobile}
        <Button.Root onclick={() => goto(`/${page.params.space}`)}>
          <Icon icon="uil:left" />
        </Button.Root>
      {:else}
        {#await g.channel.image && g.roomy.open(Image, g.channel.image) then image}
          <!-- TODO: We're using #key to recreate avatar image when channel changes since for some reason the
          avatarimage component doesn't re-render properly by itself.  -->
          {#key g.channel.id}
            <AvatarImage avatarUrl={image?.uri} handle={g.channel.id} />
          {/key}
        {/await}
      {/if}

      <h4
        class={`${isMobile && "line-clamp-1 overflow-hidden text-ellipsis"} text-base-content text-lg font-bold`}
        title={g.channel instanceof Channel ? "Channel" : "Thread"}
      >
        <span class="flex gap-2 items-center">
          <Icon
            icon={g.channel instanceof Channel
              ? "basil:comment-solid"
              : "material-symbols:thread-unread-rounded"}
          />
          {g.channel.name}
        </span>
      </h4>
    {/if}
  </div>

  {#if !isMobile}
    <div class="navbar-end">
      {@render toolbar()}
    </div>
  {/if}
</header>
<div class="divider my-0"></div>

{#if g.space && g.channel}
  <ChatArea timeline={g.channel.forceCast(Timeline)} />
  <div class="flex items-center">
    {#if isMobile}
      {@render toolbar()}
    {/if}
  </div>
{/if}

{#snippet toolbar()}
  <menu class="relative flex items-center gap-3 px-2 w-fit justify-end">
    <Button.Root
      title="Copy invite link"
      class="cursor-pointer hover:scale-105 active:scale-95 transition-all duration-150"
      onclick={() => {
        navigator.clipboard.writeText(`${page.url.href}`);
      }}
    >
      <Icon icon="icon-park-outline:copy-link" class="text-2xl" />
    </Button.Root>
  </menu>
{/snippet}
