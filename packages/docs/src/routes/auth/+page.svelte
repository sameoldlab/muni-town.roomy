<svelte:head>
  <title>Authentication — Roomy Appserver API Docs</title>
</svelte:head>

<div class="prose dark:prose-invert">
  <h1>Authentication</h1>

  <p class="lead text-lg text-base-600 dark:text-base-400">
    The appserver authenticates callers using ATProto inter-service JWTs proxied through the user's PDS for HTTP requests, and a separate ticket exchange for WebSocket connections.
  </p>

  <hr />

  <h2>HTTP Request Flow</h2>

  <p>The browser never authenticates directly with the appserver — the PDS validates the user's OAuth session, mints a short-lived JWT, and forwards the request.</p>

  <pre><code>Browser → PDS (atproto-proxy header) → Appserver (JWT validation)</code></pre>

  <ol>
    <li>Browser sends a request to its PDS with header: <code>atproto-proxy: did:web:appserver.roomy.chat#space_roomy_appserver</code></li>
    <li>PDS validates the user's OAuth session, creates an inter-service JWT:
      <ul>
        <li><code>iss</code> = user DID</li>
        <li><code>aud</code> = appserver DID (<code>did:web:appserver.roomy.chat</code>)</li>
        <li><code>exp</code> = expiry timestamp</li>
        <li>Signed with the user's DID signing key</li>
      </ul>
    </li>
    <li>PDS forwards the request to the appserver with <code>Authorization: Bearer &lt;jwt&gt;</code></li>
    <li>Appserver validates the JWT</li>
  </ol>

  <h2>WebSocket Auth Flow</h2>

  <p>PDSes cannot proxy long-lived WebSocket connections, so a separate ticket exchange is used.</p>

  <pre><code>Browser → PDS proxy → Appserver (ticket exchange)
Browser → Appserver direct (WebSocket with ?ticket=)</code></pre>

  <ol>
    <li>Browser calls <code>POST /xrpc/space.roomy.auth.getConnectionTicket</code> via PDS proxy (full JWT auth)</li>
    <li>Appserver returns a 64-char hex ticket (single-use, 60-second TTL)</li>
    <li>Browser opens a WebSocket directly to the appserver: <code>wss://appserver.roomy.chat/xrpc/&#123;nsid&#125;?ticket=&lt;ticket&gt;&&#123;params&#125;</code></li>
  </ol>

  <h2>JWT Validation (prodAuthVerifier)</h2>

  <p>Every HTTP request is validated through the production auth verifier in <code>src/xrpc/auth.ts</code>:</p>

  <ol>
    <li>Extract <code>Bearer &lt;jwt&gt;</code> from <code>Authorization</code> header</li>
    <li>Decode JWT payload (base64url, no crypto) to read <code>iss</code>, <code>aud</code>, <code>exp</code></li>
    <li>Verify <code>aud</code> matches <code>APPSERVER_DID</code> env var (default: <code>did:web:api.roomy.space</code>)</li>
    <li>Verify <code>exp</code> is in the future</li>
    <li>Resolve <code>iss</code> DID document (did:plc via PLC directory, did:web via HTTPS, 30-minute cache)</li>
    <li>Extract signing key using <code>getAtprotoVerificationMaterial</code> from <code>@atcute/identity</code></li>
    <li>Decode multibase key, detect algorithm via multicodec prefix (secp256k1 or P-256)</li>
    <li>Verify JWT signature using <code>@noble/curves</code> (ES256K or ES256)</li>
  </ol>

  <p>Returns <code>AuthCtx: &#123; did: string &#125;</code> on success, throws <code>XrpcError(401)</code> on any failure.</p>

  <h2>Test Mode</h2>

  <p>When <code>APPSERVER_TEST_MODE=true</code>, a header-based bypass (<code>X-Test-Did</code>) is used instead of JWT verification. This enables E2E testing without a PDS or PLC dependency.</p>

  <h2>Ticket Store</h2>

  <p>The ticket store in <code>src/xrpc/auth.ts</code> manages WebSocket pre-auth:</p>

  <ul>
    <li><code>issueTicket(did)</code> — generates a 32-byte random hex token, stores with DID and 60s TTL</li>
    <li><code>consumeTicket(ticket)</code> — single-use lookup, deletes immediately, throws 401 if missing/expired</li>
    <li>Periodic cleanup every 5 minutes removes expired entries</li>
  </ul>

  <h2>Authorization Model</h2>

  <p>The appserver mirrors the SDK's authorization model. Two key facts:</p>

  <ol>
    <li><strong>Admin and membership are orthogonal.</strong> A caller may be an admin without being a member, or a member without being an admin. Every authorization decision is the union of (a) admin-edge presence and (b) role-derived permissions.</li>
    <li><strong>Per-room access is the union of three signals:</strong>
      <ul>
        <li>Caller has the <code>admin</code> edge on the space, <strong>or</strong></li>
        <li>The room's <code>default_access</code> (or its parent channel's, for threads) permits the operation, <strong>or</strong></li>
        <li>The caller has a role assigned via <code>member_roles</code> whose <code>role_rooms</code> entry for that room grants the required permission level.</li>
      </ul>
    </li>
  </ol>

  <h3>Per-Endpoint Requirements</h3>

  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Caller must be</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>getSpaces</td><td>Authenticated; returns spaces where caller is member OR admin</td></tr>
      <tr><td>getMetadata (space)</td><td>Member OR admin of the space</td></tr>
      <tr><td>getThreads (space)</td><td>Member OR admin of the space</td></tr>
      <tr><td>getRoles</td><td>Member OR admin of the space</td></tr>
      <tr><td>getMembers</td><td>Member OR admin of the space</td></tr>
      <tr><td>getInvites</td><td>Admin (sees all) OR creator (sees own only)</td></tr>
      <tr><td>getMetadata (room)</td><td>Has read access to the room</td></tr>
      <tr><td>getMessages / getThreads (room) / getMessage</td><td>Has read access to the room</td></tr>
      <tr><td>getConnectionTicket</td><td>Authenticated</td></tr>
      <tr><td>updateSeen</td><td>Has read access to the room</td></tr>
      <tr><td>sync.subscribe topics</td><td>Per-topic: must have read access</td></tr>
    </tbody>
  </table>

  <h2>Configuration</h2>

  <table>
    <thead>
      <tr>
        <th>Env Var</th>
        <th>Default</th>
        <th>Purpose</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><code>APPSERVER_DID</code></td><td><code>did:web:api.roomy.space</code></td><td>Expected JWT audience, DID document id</td></tr>
      <tr><td><code>APPSERVER_ORIGIN</code></td><td><code>https://appserver.roomy.chat</code></td><td>DID document serviceEndpoint</td></tr>
      <tr><td><code>PLC_DIRECTORY_URL</code></td><td><code>https://plc.directory</code></td><td>DID resolver for did:plc lookups</td></tr>
      <tr><td><code>PORT</code></td><td><code>8080</code></td><td>Listen port</td></tr>
      <tr><td><code>CORS_ORIGIN</code></td><td><code>*</code></td><td>Access-Control-Allow-Origin</td></tr>
    </tbody>
  </table>
</div>
