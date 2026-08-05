<script lang="ts">
  import { Modal } from "@foxui/core";
  import Button from "../../../ui/button/Button.svelte";
  import { IconTrash } from "../../../../icons/index";

  let {
    open = $bindable(false),
    authorName,
    isAdminDelete = false,
    onConfirm,
  }: {
    open: boolean;
    /** Display name of the message author — shown in the confirm body. */
    authorName?: string;
    /** True when the caller is a space admin deleting someone else's message. */
    isAdminDelete?: boolean;
    onConfirm: () => void | Promise<void>;
  } = $props();

  let deleting = $state(false);

  async function confirm() {
    if (deleting) return;
    deleting = true;
    try {
      await onConfirm();
    } finally {
      deleting = false;
      open = false;
    }
  }
</script>

<Modal bind:open closeButton={true} class="gap-6">
  <div class="flex flex-col gap-2">
    <h1
      id="dialog-title"
      class="text-base font-bold text-xl text-base-900 dark:text-base-100"
    >
      Delete message
    </h1>
    <p class="text-base-800 dark:text-base-300 text-sm">
      {#if isAdminDelete}
        Are you sure you want to delete
        {#if authorName}
          <b>{authorName}</b>'s
        {:else}
          this user's
        {/if}
        message? This cannot be undone.
      {:else}
        Are you sure you want to delete this message? This cannot be undone.
      {/if}
    </p>
  </div>
  <div class="flex flex-row w-full justify-end gap-2">
    <Button onclick={() => (open = false)} variant="secondary">
      Cancel
    </Button>
    <Button onclick={confirm} variant="red" disabled={deleting}>
      <IconTrash class="size-4" />
      {deleting ? "Deleting…" : "Delete Message"}
    </Button>
  </div>
</Modal>
