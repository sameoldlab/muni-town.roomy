<script lang="ts">
  import ChatArea, { type Message } from "./ChatArea.svelte";
  import ChatInputArea from "./ChatInputArea.svelte";
  import { setInputFocus } from "./ChatInput.svelte";
  import { Button } from "@fuxui/base";
  let { kind = "chat" } = $props();
  const threading: {
    active: boolean;
    selectedMessages: Message[];
    name: string;
  } = $state({ active: false, selectedMessages: [], name: "" });

  function startThreading(message?: Message) {
    threading.active = true;
    message && threading.selectedMessages.push(message);
    setInputFocus();
  }

  function toggleSelect(message: Message) {
    let messageIdx = threading.selectedMessages.findIndex(
      (x) => x.id == message.id,
    );
    if (messageIdx != -1) {
      threading.selectedMessages.splice(messageIdx, 1);
    } else {
      threading.selectedMessages.push(message);
    }
  }
</script>

<div class="flex flex-col flex-1 h-full min-h-0 justify-stretch">
  <ChatArea {threading} {startThreading} {toggleSelect} {kind} />

  {#if kind === "chat"}
    <div class="shrink-0 mt-auto">
      <ChatInputArea {threading} />
    </div>
  {:else if kind === "link"}
    <div class="shrink-0 mt-auto flex items-center flex-col">
      <Button disabled class="w-full">Automatted Thread</Button>
    </div>
  {/if}
</div>
