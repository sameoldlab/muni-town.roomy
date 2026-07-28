<svelte:head>
  <title>Architecture — Roomy Appserver API Docs</title>
</svelte:head>

<div class="prose dark:prose-invert">
  <h1>Architecture</h1>

  <p class="lead text-lg text-base-600 dark:text-base-400">
    The Roomy Appserver is an adapter layer over the Leaf event-stream backend, providing a clean XRPC interface for thin clients.
  </p>

  <hr />

  <h2>System Architecture</h2>

  <pre><code>Browser (SvelteKit)
  TanStack Query (in-memory cache, reactive queries)
    |  HTTP (via PDS proxy) + single multiplexed WebSocket
Appserver (Bun + TypeScript, Dockerised)
  SQLite / bun:sqlite (persisted materialised views)
  Leaf client subscription → materialisation → XRPC handlers
  Auth middleware (ATProto inter-service JWT + pre-auth tickets)
    |  Leaf client (existing)
Leaf Server  ←→  AT Protocol PDS</code></pre>

  <h2>Data Flow</h2>

  <h3>Initial Load</h3>
  <ol>
    <li>TanStack Query fires <code>queryFn</code> → HTTP GET via PDS proxy → appserver → SQLite</li>
    <li>Response populates cache with <code>staleTime: Infinity</code></li>
  </ol>

  <h3>Real-time Updates</h3>
  <ol>
    <li>Leaf event arrives at appserver</li>
    <li>Appserver materialises to SQLite, determines affected topics</li>
    <li>Message events → <code>#messageDiff</code> CBOR frame → WebSocket → <code>setQueryData()</code> (no HTTP)</li>
    <li>Other events → <code>#invalidate</code> CBOR frame → WebSocket → <code>invalidateQueries()</code> → HTTP re-fetch</li>
  </ol>

  <h3>Reconnection</h3>
  <ol>
    <li>Client reconnects with cursor (last received seq)</li>
    <li>Server replays missed message diffs from SQLite event log</li>
    <li>Server sends broad invalidation signals for non-message data</li>
  </ol>

  <h2>Implementation Stack</h2>

  <table>
    <thead>
      <tr>
        <th>Component</th>
        <th>Choice</th>
        <th>Rationale</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Runtime</td>
        <td>Bun</td>
        <td>Native HTTP + WebSocket, built-in SQLite, fast startup</td>
      </tr>
      <tr>
        <td>Server DB</td>
        <td>bun:sqlite</td>
        <td>Built-in, zero-config, sufficient for single-node deployment</td>
      </tr>
      <tr>
        <td>Client cache</td>
        <td>TanStack Query v5/v6</td>
        <td>Production-grade, Svelte 5 runes, invalidateQueries() + setQueryData()</td>
      </tr>
      <tr>
        <td>Wire format</td>
        <td>CBOR via @atcute/cbor</td>
        <td>ATProto standard, already in monorepo</td>
      </tr>
      <tr>
        <td>Auth</td>
        <td>@noble/curves + @atcute/identity</td>
        <td>ES256K/ES256 JWT verification, DID resolution</td>
      </tr>
      <tr>
        <td>Lexicons</td>
        <td>ATProto JSON schema format</td>
        <td>Standard, enables future on-protocol migration</td>
      </tr>
    </tbody>
  </table>

  <h2>What Disappears from the Client</h2>

  <table>
    <thead>
      <tr>
        <th>Removed</th>
        <th>Replaced by</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>SQLite WASM worker</td><td>Appserver SQLite (bun:sqlite)</td></tr>
      <tr><td>Peer/shared worker materialisation</td><td>Appserver subscribes to Leaf, materialises server-side</td></tr>
      <tr><td>LiveQuery / livequery() calls</td><td>TanStack Query + WS invalidation signals</td></tr>
      <tr><td>Client-side join logic</td><td>Server handles in query responses</td></tr>
    </tbody>
  </table>

  <h2>Directory Structure</h2>

  <pre><code>packages/appserver/
  src/
    index.ts                  ← Bun.serve() entry, DID doc, CORS
    appserver.ts              ← Server factory (createAppserver)
    xrpc/
      router.ts               ← XrpcRouter: HTTP + WS routing
      types.ts                ← Shared types (AuthCtx, Frame, handlers)
      auth.ts                 ← JWT validation, DID resolution, ticket store
      errors.ts               ← XrpcError class
      frame.ts                ← CBOR frame encoding
    sync/
      handler.ts              ← Multiplexed WS sync handler
    handlers/                 ← One file per XRPC NSID
    auth/
      access.ts               ← Shared predicates: isMember, isAdmin, canRead, canWrite
    db/
      schema.sql              ← SQLite schema + materialised view tables
    materialization/          ← Event materialisation logic
    invalidation/             ← Invalidation signal router
    streams/                  ← StreamManager, reMaterialize
    embed/                    ← Link-card embed enrichment
    hydration/                ← User/space hydration from PDS
    queries/                  ← SQL query helpers
    push/                     ← Web Push notification logic
  lexicons/                   ← ATProto JSON lexicon definitions</code></pre>

  <h2>Migration Strategy</h2>

  <ol>
    <li><strong>Phase 0 (done):</strong> Architecture docs, research, scaffold package, implement auth foundation.</li>
    <li><strong>Phase 1 (now):</strong> Implement appserver — Bun HTTP + WebSocket, Leaf connection, SQLite schema, XRPC routing, working queries.</li>
    <li><strong>Phase 2:</strong> Implement all query handlers + WS sync handler. Port client from LiveQuery to TanStack Query + XRPC.</li>
    <li><strong>Phase 3:</strong> Remove SQLite WASM worker and peer worker from client.</li>
    <li><strong>Phase 4:</strong> Hand off to Rust appserver (same XRPC interface, drop-in replacement).</li>
  </ol>
</div>
