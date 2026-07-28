<script lang="ts">
  import { page } from "$app/stores";
  import { endpointByNsid } from "$lib/endpoints/registry";
  import EndpointDetail from "$lib/components/EndpointDetail.svelte";

  // Reconstruct NSID from the path segments: /endpoints/space/roomy/space/getSpaces
  const nsid = $derived(
    $page.params.nsid
      ? $page.params.nsid.replace(/\//g, ".")
      : ""
  );

  const endpoint = $derived(endpointByNsid[nsid]);
</script>

<svelte:head>
  <title>{nsid} — Roomy Appserver API Docs</title>
</svelte:head>

{#if endpoint}
  <EndpointDetail {endpoint} />
{:else}
  <div class="prose dark:prose-invert">
    <h1>Endpoint Not Found</h1>
    <p>No endpoint found for NSID: <code>{nsid}</code></p>
    <p><a href="/endpoints">View all endpoints</a></p>
  </div>
{/if}
