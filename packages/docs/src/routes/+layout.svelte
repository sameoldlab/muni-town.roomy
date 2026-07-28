<script lang="ts">
  import "../app.css";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { page } from "$app/stores";
</script>

<div class="flex h-screen overflow-hidden">
  <Sidebar />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-4xl mx-auto px-6 py-8">
      {@render children()}
    </div>
  </main>
</div>
