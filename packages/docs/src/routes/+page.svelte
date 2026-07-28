<script lang="ts">
  import { endpoints } from "$lib/endpoints/registry";
</script>

<svelte:head>
  <title>Roomy Appserver API Docs</title>
</svelte:head>

<div class="prose dark:prose-invert">
  <h1>Roomy Appserver API</h1>

  <p class="lead text-lg text-base-600 dark:text-base-400">
    Comprehensive documentation for the Roomy Appserver XRPC interface — the server-side API
    that powers the Roomy chat platform.
  </p>

  <hr />

  <h2>What is the Appserver?</h2>

  <p>
    The Roomy Appserver is a <strong>Bun/TypeScript service</strong> that provides an XRPC interface
    between thin clients (SvelteKit browser apps) and the Leaf event-stream backend. It acts as an
    <strong>adapter layer</strong> over Leaf, providing a clean, denormalized API that clients consume
    directly — no client-side SQLite, no workers, no materialisation.
  </p>

  <p>
    The appserver is explicitly <strong>transitional</strong> — it will be replaced by a Rust service
    with the same XRPC interface. The XRPC interface, client architecture (TanStack Query), and the
    semantic/denormalized API design are permanent goals.
  </p>

  <h2>Architecture at a Glance</h2>

  <pre><code>Browser (SvelteKit)
  TanStack Query (in-memory cache, reactive queries)
    |  HTTP (via PDS proxy) + single multiplexed WebSocket
Appserver (Bun + TypeScript, Dockerised)
  SQLite / bun:sqlite (persisted materialised views)
  Leaf client subscription → materialisation → XRPC handlers
  Auth middleware (ATProto inter-service JWT + pre-auth tickets)
    |  Leaf client (existing)
Leaf Server  ←→  AT Protocol PDS</code></pre>

  <h2>API Surface</h2>

  <p>The appserver exposes <strong>{endpoints.reduce((s, g) => s + g.items.length, 0)} XRPC methods</strong> across {endpoints.length} categories:</p>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Count</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      {#each endpoints as group}
        <tr>
          <td><a href="/endpoints/{group.items[0].nsid.replace(/\./g, '/')}">{group.name}</a></td>
          <td>{group.items.length}</td>
          <td>
            {#if group.name === 'Auth'}
              WebSocket pre-auth ticket exchange
            {:else if group.name === 'Spaces'}
              Space CRUD, metadata, members, roles, invites, activity feed
            {:else if group.name === 'Rooms'}
              Room metadata, messages, threads, read state
            {:else if group.name === 'Messages'}
              Single message lookup, reactions
            {:else if group.name === 'Users'}
              User profile retrieval
            {:else if group.name === 'Sync'}
              Multiplexed real-time WebSocket protocol
            {:else if group.name === 'Push Notifications'}
              Web Push subscription management and preferences
            {:else if group.name === 'Feature Flags'}
              Per-user feature flag evaluation
            {:else if group.name === 'Admin'}
              Dashboard stats, space inspection, flag management
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>Key Design Decisions</h2>

  <dl>
    <dt class="font-semibold mt-4">Single multiplexed WebSocket</dt>
    <dd>Browser WebSocket limits (~6 per domain) make per-procedure subscriptions unviable. A single <code>space.roomy.sync.subscribe</code> connection carries all real-time data as typed CBOR frames.</dd>

    <dt class="font-semibold mt-4">TanStack Query (not TanStack DB)</dt>
    <dd>Since the server owns all joins and returns denormalized results, TanStack DB's incremental view maintenance adds no value. TanStack Query provides <code>invalidateQueries()</code> and <code>setQueryData()</code> for WS-driven cache updates.</dd>

    <dt class="font-semibold mt-4">Server-side joins, denormalized API</dt>
    <dd>The appserver owns all SQL joins. Every query endpoint returns fully assembled objects — the client never joins data across queries.</dd>

    <dt class="font-semibold mt-4">WS is sole freshness authority</dt>
    <dd>All queries use <code>staleTime: Infinity</code>. HTTP re-fetches only on WS invalidation signals.</dd>

    <dt class="font-semibold mt-4">Admin ⊥ Membership</dt>
    <dd>Admin and membership are orthogonal. A caller can be an admin without being a member, or vice versa. Every authorization decision is the union of admin-edge presence and role-derived permissions.</dd>
  </dl>

  <h2>Getting Started</h2>

  <ul>
    <li><a href="/architecture">Architecture overview</a> — full system design and data flow</li>
    <li><a href="/auth">Authentication</a> — PDS proxy JWTs and WebSocket tickets</li>
    <li><a href="/sync">Sync protocol</a> — real-time WebSocket communication</li>
    <li><a href="/schema">Database schema</a> — SQLite materialized view tables</li>
    <li><a href="/endpoints">All endpoints</a> — complete XRPC method reference</li>
  </ul>
</div>
