<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { g } from "$lib/global.svelte";
  import { user } from "$lib/user.svelte";
  import { onMount } from "svelte";

  let error = $state("");

  onMount(async () => {
    await user.init();
  });

  $effect(() => {
    if (user.agent && g.catalog) {
      (async () => {
        const did = page.params.did!;
        const profile = await user.agent!.getProfile({ actor: did });

        g.catalog?.change((doc) => {
          doc.dms[did] = {
            name: profile.data.handle,
            avatar: profile.data.avatar,
            viewedHeads: [],
          };
        });

        goto(`/dm/${did}`);
      })();
    }
  });
</script>

{#if error}
  <p>
    Error accepting invite: {error}.
  </p>
  <p>
    <a href="/">Go Home</a>
  </p>
{/if}
