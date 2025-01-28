<script lang="ts">
  import "../../app.css";
  import Icon from "@iconify/svelte";
  import { fade } from "svelte/transition";
  import { AvatarBeam, AvatarPixel } from "svelte-boring-avatars";
  import { Avatar, Button, Dialog, Separator, ToggleGroup } from "bits-ui";
  import { onMount } from "svelte";
  import { user } from "$lib/user.svelte";
  import { encodeBase32 } from "$lib/base32";
  import { goto } from "$app/navigation";

  let { children } = $props();

  let handleInput = $state("");
  let isLoginDialogOpen = $derived(!user.session);

  onMount(async () => {
    await user.init();
  });

  // TODO: set servers/rooms based on user
  let servers = ["barrel_of_monkeys", "offishal"];
  let currentServer: string = $state("muni");
</script>

<!-- Container -->
<div class="flex gap-4 p-4 bg-violet-900 w-screen h-screen">
  <!-- Server Bar -->
  <aside
    class="flex flex-col justify-between w-20 h-full bg-violet-950 rounded-lg px-4 py-8 items-center"
  >
    <ToggleGroup.Root type="single" class="flex flex-col gap-4 items-center">
      <ToggleGroup.Item
        value="dm"
        on:click={() => goto("/dm")}
        class="capitalize hover:scale-105 transition-all duration-150 active:scale-95 hover:bg-white/5 border border-transparent data-[state=on]:border-white data-[state=on]:scale-98 data-[state=on]:bg-white/5 text-white p-4 rounded-md"
      >
        <Avatar.Root>
          <!-- TODO: set images based on server -->
          <Avatar.Image />
          <Avatar.Fallback>
            <Icon icon="ri:user-fill" font-size="2em" />
          </Avatar.Fallback>
        </Avatar.Root>
      </ToggleGroup.Item>
      {#each servers as server}
        <ToggleGroup.Item
          onclick={() => goto(`/space/${server}`)}
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
      <Button.Root
        class="hover:scale-105 active:scale-95 transition-all duration-150"
      >
        <Icon icon="basil:settings-alt-solid" color="white" class="text-2xl" />
      </Button.Root>
      <Dialog.Root open={isLoginDialogOpen}>
        <Dialog.Trigger
          class="hover:scale-105 active:scale-95 transition-all duration-150"
        >
          <Avatar.Root>
            <Avatar.Image
              src={user.profile.data?.avatar}
              class="rounded-full"
            />
            <Avatar.Fallback>
              <AvatarBeam name="pigeon" />
            </Avatar.Fallback>
          </Avatar.Root>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            transition={fade}
            transitionConfig={{ duration: 150 }}
            class="fixed inset-0 z-50 bg-black/80"
          />
          <Dialog.Content
            class="fixed p-5 flex flex-col text-white gap-4 w-dvw max-w-(--breakpoint-sm) left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-purple-950"
          >
            <Dialog.Title class="text-bold font-bold text-xl">User</Dialog.Title
            >
            <Separator.Root class="border border-white" />
            {#if user.session}
              <section class="flex flex-col gap-4">
                <p>Logged in as {user.profile.data?.handle}</p>
                {#if user.keypair.value}
                  <p>
                    <strong>PublicKey: </strong>
                    {encodeBase32(
                      user.keypair.value?.publicKey || new Uint8Array(),
                    )}
                  </p>
                {/if}
                <Button.Root
                  onclick={user.logout}
                  class="px-4 py-2 bg-white text-black rounded-lg hover:scale-[102%] active:scale-95 transition-all duration-150"
                >
                  Logout
                </Button.Root>
              </section>
            {:else}
              <section class="flex flex-col gap-4">
                <input
                  type="url"
                  bind:value={handleInput}
                  placeholder="Handle (eg alice.bsky.social)"
                  class="w-full outline-hidden border border-white px-4 py-2 rounded-sm bg-transparent"
                />
                <Button.Root
                  class="px-4 py-2 bg-white text-black rounded-lg hover:scale-[102%] active:scale-95 transition-all duration-150"
                  onclick={async () => await user.loginWithHandle(handleInput)}
                >
                  Login with Bluesky
                </Button.Root>
              </section>
            {/if}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  </aside>

  {@render children()}
</div>
