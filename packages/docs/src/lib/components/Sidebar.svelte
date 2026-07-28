<script lang="ts">
  import { endpoints, type EndpointGroup } from "$lib/endpoints/registry";
  import { page } from "$app/stores";
</script>

<aside class="w-72 shrink-0 border-r border-base-200 dark:border-base-800 bg-base-50 dark:bg-base-950 overflow-y-auto">
  <div class="p-4">
    <a href="/" class="flex items-center gap-2 mb-6 no-underline">
      <span class="text-xl font-display font-bold text-accent-600 dark:text-accent-400">Roomy</span>
      <span class="text-sm text-base-500">Appserver API</span>
    </a>

    <nav class="space-y-1">
      <a
        href="/"
        class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors
          {$page.url.pathname === '/' ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' : 'text-base-600 dark:text-base-400 hover:bg-base-100 dark:hover:bg-base-900'}"
      >
        Overview
      </a>
      <a
        href="/architecture"
        class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/architecture') ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' : 'text-base-600 dark:text-base-400 hover:bg-base-100 dark:hover:bg-base-900'}"
      >
        Architecture
      </a>
      <a
        href="/auth"
        class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/auth') ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' : 'text-base-600 dark:text-base-400 hover:bg-base-100 dark:hover:bg-base-900'}"
      >
        Authentication
      </a>
      <a
        href="/sync"
        class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/sync') ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' : 'text-base-600 dark:text-base-400 hover:bg-base-100 dark:hover:bg-base-900'}"
      >
        Sync Protocol
      </a>
      <a
        href="/schema"
        class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/schema') ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' : 'text-base-600 dark:text-base-400 hover:bg-base-100 dark:hover:bg-base-900'}"
      >
        Database Schema
      </a>

      <div class="mt-6 mb-2">
        <h3 class="px-3 text-xs font-semibold uppercase tracking-wider text-base-400 dark:text-base-500">Endpoints</h3>
      </div>

      {#each endpoints as group (group.name)}
        <div class="mb-1">
          <h4 class="px-3 text-xs font-medium text-base-400 dark:text-base-500 uppercase tracking-wider mt-3 mb-1">{group.name}</h4>
          {#each group.items as ep}
            <a
              href="/endpoints/{ep.nsid.replace(/\./g, '/')}"
              class="block px-3 py-1.5 rounded-lg text-sm transition-colors
                {$page.url.pathname === '/endpoints/' + ep.nsid.replace(/\./g, '/') ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' : 'text-base-600 dark:text-base-400 hover:bg-base-100 dark:hover:bg-base-900'}"
            >
              <span class="font-mono text-xs">{ep.nsid}</span>
            </a>
          {/each}
        </div>
      {/each}
    </nav>
  </div>
</aside>
