<svelte:head>
  <title>Sync Protocol — Roomy Appserver API Docs</title>
</svelte:head>

<div class="prose dark:prose-invert">
  <h1>Sync Protocol</h1>

  <p class="lead text-lg text-base-600 dark:text-base-400">
    A single multiplexed WebSocket connection carries all real-time data. The client subscribes/unsubscribes to topics; the server pushes message diffs and invalidation signals.
  </p>

  <hr />

  <h2>Connection Lifecycle</h2>

  <pre><code>1. Client obtains ticket via POST /xrpc/space.roomy.auth.getConnectionTicket
2. Client opens WebSocket:
   wss://appserver.roomy.chat/xrpc/space.roomy.sync.subscribe?ticket=&lt;ticket&gt;
3. Server validates ticket, accepts connection
4. Client sends &#123; "type": "cursor", "seq": N &#125; if reconnecting (0 for first connect)
5. Client sends sub messages for active topics
6. Server replays missed diffs (if cursor is within buffer) + sends invalidation signals
7. Server pushes frames for subscribed topics going forward
8. On disconnect: client reconnects with new ticket + last received seq</code></pre>

  <h2>Client &rarr; Server Messages</h2>

  <p>JSON-encoded text frames:</p>

  <pre><code>// Subscribe to a topic
&#123; "type": "sub", "topic": "space", "id": "&lt;spaceId&gt;" &#125;
&#123; "type": "sub", "topic": "room", "id": "&lt;roomId&gt;" &#125;

// Unsubscribe from a topic
&#123; "type": "unsub", "topic": "room", "id": "&lt;roomId&gt;" &#125;

// Reconnection cursor (sent once, immediately after connect)
&#123; "type": "cursor", "seq": 12345 &#125;</code></pre>

  <h3>Topic Semantics</h3>
  <table>
    <thead>
      <tr>
        <th>Topic</th>
        <th>Content</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><code>space:&lt;id&gt;</code></td><td>Sidebar/metadata changes, membership changes, thread creation</td></tr>
      <tr><td><code>room:&lt;id&gt;</code></td><td>Message diffs, room metadata changes, reaction changes, thread activity</td></tr>
      <tr><td><code>stream:&lt;id&gt;</code></td><td>Raw event stream (cursor-based backfill)</td></tr>
    </tbody>
  </table>

  <p>Subscribing to a space does <strong>not</strong> automatically subscribe to all rooms in it. Room subscriptions are explicit.</p>

  <h2>Server &rarr; Client Messages</h2>

  <p>CBOR-encoded binary frames using ATProto wire format (two consecutive CBOR values: header + body).</p>

  <table>
    <thead>
      <tr>
        <th><code>t</code> (event type)</th>
        <th><code>op</code></th>
        <th>Purpose</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><code>#messageDiff</code></td><td>1</td><td>Message add/update/remove for a subscribed room</td></tr>
      <tr><td><code>#invalidate</code></td><td>1</td><td>Signal that a query's data is stale</td></tr>
      <tr><td><code>#error</code></td><td>-1</td><td>Error frame (closes connection)</td></tr>
    </tbody>
  </table>

  <h3>#messageDiff</h3>

  <p>Applied directly to TanStack Query cache via <code>setQueryData()</code>. No HTTP round-trip.</p>

  <pre><code>// Header: &#123; op: 1, t: "#messageDiff" &#125;
// Body:
&#123;
  roomId: string;
  seq: number;
  ops: Array&lt;&#123;
    op: "add" | "update" | "remove";
    key: string;          // message entity ID
    message?: &#123;           // present for add/update, absent for remove
      id: string;
      content: string;
      authorDid: string;
      authorName: string;
      authorAvatar: string | null;
      timestamp: string;
      replyTo: string | null;
      forwardedFrom: &#123; name: string; roomId: string &#125; | null;
      reactions: Array&lt;&#123; emoji: string; dids: string[] &#125;&gt;;
      media: Array&lt;&#123; url: string; type: string; alt: string | null &#125;&gt;;
      tags: string[];
    &#125;;
  &#125;&gt;;
&#125;</code></pre>

  <h3>#invalidate</h3>

  <p>Triggers <code>invalidateQueries()</code> for the specified endpoint.</p>

  <pre><code>// Header: &#123; op: 1, t: "#invalidate" &#125;
// Body:
&#123;
  nsid: string;                      // e.g. "space.roomy.space.getMetadata"
  params: Record&lt;string, string&gt;;    // e.g. &#123; spaceId: "..." &#125;
&#125;</code></pre>

  <p>The client maps this directly to:</p>
  <pre><code>queryClient.invalidateQueries(&#123; queryKey: [nsid, params] &#125;);</code></pre>

  <h3>#error</h3>

  <pre><code>// Header: &#123; op: -1, t: "#error" &#125;
// Body:
&#123;
  error: string;     // e.g. "TokenExpired", "InternalServerError"
  message: string;
&#125;</code></pre>

  <h2>Reconnection</h2>

  <p>The appserver maintains a bounded in-memory event log (ring buffer, ~10k entries) with a global monotonically increasing sequence number.</p>

  <ol>
    <li>Client reconnects with a new ticket</li>
    <li>Client sends <code>&#123; "type": "cursor", "seq": N &#125;</code> immediately after connecting (where N is the last received seq)</li>
    <li>Client sends <code>sub</code> messages for its active topics</li>
    <li>If N is within the buffer: server replays missed <code>#messageDiff</code> frames where <code>seq &gt; N</code> AND topic matches the client's current subscriptions, then sends <code>#invalidate</code> for all subscribed non-message queries</li>
    <li>If N is outside the buffer (or 0): server sends <code>#invalidate</code> for all subscribed queries (client re-fetches everything via HTTP)</li>
  </ol>

  <p>No persistence across restarts — clients receive full invalidation on appserver restart.</p>

  <h2>Event &rarr; Frame Mapping</h2>

  <table>
    <thead>
      <tr>
        <th>Leaf event</th>
        <th>Affected topic(s)</th>
        <th>Server action</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>New message in room X</td><td><code>room:X</code></td><td><code>#messageDiff</code> (add)</td></tr>
      <tr><td>Message edit in room X</td><td><code>room:X</code></td><td><code>#messageDiff</code> (update)</td></tr>
      <tr><td>Message delete in room X</td><td><code>room:X</code></td><td><code>#messageDiff</code> (remove)</td></tr>
      <tr><td>Reaction add/remove in room X</td><td><code>room:X</code></td><td><code>#messageDiff</code> (update)</td></tr>
      <tr><td>Room name/kind change</td><td><code>space:&lt;parent&gt;</code></td><td><code>#invalidate</code> for room.getMetadata</td></tr>
      <tr><td>New thread in channel X (space Y)</td><td><code>space:Y</code>, <code>room:X</code></td><td><code>#invalidate</code> for space.getMetadata, space.getThreads, room.getMetadata</td></tr>
      <tr><td>Space name/avatar/description change</td><td><code>space:X</code></td><td><code>#invalidate</code> for space.getMetadata</td></tr>
      <tr><td>Sidebar config change</td><td><code>space:X</code></td><td><code>#invalidate</code> for space.getMetadata</td></tr>
      <tr><td>User join/leave space X</td><td><code>space:X</code></td><td><code>#invalidate</code> for getSpaces, getMetadata, getThreads, getMembers</td></tr>
      <tr><td>Admin edge add/remove</td><td><code>space:X</code></td><td><code>#invalidate</code> for getSpaces, getMetadata, getMembers</td></tr>
      <tr><td>Unread count change</td><td><code>room:X</code>, <code>space:&lt;parent&gt;</code></td><td><code>#invalidate</code> for room.getMetadata, space.getMetadata, space.getSpaces</td></tr>
      <tr><td>Role create/update/delete</td><td><code>space:Y</code></td><td><code>#invalidate</code> for space.getRoles</td></tr>
      <tr><td>addMemberRole / removeMemberRole</td><td><code>space:Y</code></td><td><code>#invalidate</code> for getRoles, getMembers</td></tr>
      <tr><td>createInvite / revokeInvite</td><td><code>space:Y</code></td><td><code>#invalidate</code> for space.getInvites</td></tr>
    </tbody>
  </table>

  <h2>Server-side Pub/Sub</h2>

  <p>The appserver maintains an in-memory routing table:</p>

  <pre><code>connection_id &rarr; &#123; did, Set&lt;topic&gt; &#125;    // identity + topics this WS connection is subscribed to
topic          &rarr; Set&lt;connection_id&gt;     // which connections care about this topic</code></pre>

  <p>When a Leaf event arrives:</p>
  <ol>
    <li>Determine affected topics (e.g. message in room X &rarr; topic <code>room:X</code>)</li>
    <li>Look up subscribed connections for that topic</li>
    <li>Generate frame(s) and send to matching connections</li>
  </ol>

  <p>Memory cost is bounded by: <code>(active connections) &times; (avg subscriptions per connection)</code>. Typical session: 1 space + 1 room = 2 topics.</p>

  <p><strong>Per-user invalidation.</strong> Some invalidations (admin edge changes, role assignment changes) only affect a specific user. The connection's authenticated <code>did</code> is recorded at WS handshake time; routing for these events filters by <code>did</code> against the topic's subscribers.</p>
</div>
