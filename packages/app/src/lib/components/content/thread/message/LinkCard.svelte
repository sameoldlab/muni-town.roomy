<script lang="ts">
  import type { Embed } from "$lib/types/embed-sdk";

  let {embed: e, url}: {
    embed: Embed,
    url: string
  } = $props()

  const cr = (value: string | undefined, seperator = ""): string =>
    value !== undefined ? ` ${seperator} ${value}` : "";
</script>
<div
  class="flex flex-col flex-wrap justify-stretch gap-4 min-[500px]:flex-row"
>
  <div class="min-w-0 flex-1 px-3 py-2 flex flex-col">
    <p class="mb-1 mt-0 text-sm leading-none opacity-70">
      {cr(e.p?.n)}
      {cr(e.au?.n, "-")}
    </p>
    <p class="mb-1 mt-1 line-clamp-2 leading-snug">
      <b class="font-bold">{e.t}</b>
    </p>
    <p class="my-0 line-clamp-4 text-sm leading-tight">
      {cr(e.d)}
    </p>
    <div class="grow py-2"></div>
    {#if e.footer}
      <p class="mt-2 mb-0 text-sm">{e.footer.t}</p>
    {/if}
    <a href={url} class="title">
      <div
        class="text-sm leading-tight underline text-blue-400"
      >
        {url}
      </div>
    </a>
  </div>
  {#if e.imgs && e.imgs.length}
    <div
      class=" w-full flex-shrink-0 p-2 min-[500px]:max-w-40"
    >
      <img
        alt={e.imgs[0]?.d ?? ""}
        class="my-0 h-full w-full rounded object-cover"
        src={e.imgs[0]?.u}
      />
    </div>
  {/if}
  {#if e.vid}
    <div
      class=" w-full flex-shrink-0 p-2 min-[500px]:max-w-40"
    >
      <video
        class="my-0 h-full w-full rounded object-cover"
        poster={e.thumb?.u}
        src={e.vid.u}
      >
        <track kind="captions" />
      </video>
    </div>
  {/if}
</div>
