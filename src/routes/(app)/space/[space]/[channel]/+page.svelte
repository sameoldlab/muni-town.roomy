<script lang="ts">
  import ChatArea from "$lib/components/ChatArea.svelte";

  const messages = [
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" },
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" },
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" },
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" },
    },
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" },
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" },
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" },
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" },
    },
    {
      content: "anybody up for gaming?",
      timestamp: new Date().setMinutes(0),
      user: { name: "alice" },
    },
    {
      content: "im down",
      timestamp: new Date().setMinutes(6),
      user: { name: "jeremy" },
    },
    {
      content: "brb",
      timestamp: new Date().setMinutes(10),
      user: { name: "zeu" },
    },
    {
      content: "coolio",
      timestamp: new Date().setMinutes(13),
      user: { name: "bob" },
    },
  ];
</script>

<ChatArea {messages} />

<input
  type="text"
  class="w-full px-4 py-2 rounded-lg bg-violet-900 flex-none"
  placeholder="Say something..."
/>
