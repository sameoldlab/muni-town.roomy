<script lang="ts">
  import { atprotoClient, initAtprotoClient } from "$lib/atproto";
  import { userStore } from "$lib/user.svelte";
  import { onMount } from "svelte";

  let error = $state("");

  onMount(() => {
    initAtprotoClient();
    const searchParams = new URL(globalThis.location.href).searchParams;

    atprotoClient
      .callback(searchParams)
      .then((result) => {
        userStore.session = result.session;
        userStore.state = result.state;

        // store the user's DID on login
        localStorage.setItem("did", userStore.session.did);

        window.location.href = "/";
      })
      .catch((e) => {
        error = e.toString();
      });
  });
</script>

{#if error}
  <p>
    Error logging in: {error}.
  </p>
  <p>
    <a href="/">Go Home</a>
  </p>
{/if}
