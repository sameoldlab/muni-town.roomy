<script>
  import { g } from "$lib/global.svelte";
</script>

<div class="h-full w-full bg-purple-950 rounded-xl p-10 overflow-y-auto text-white">
  <pre>{JSON.stringify(g, null, '  ')}</pre>
</div>
