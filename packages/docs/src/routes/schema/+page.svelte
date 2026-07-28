<svelte:head>
  <title>Database Schema — Roomy Appserver API Docs</title>
</svelte:head>

<div class="prose dark:prose-invert">
  <h1>Database Schema</h1>

  <p class="lead text-lg text-base-600 dark:text-base-400">
    The appserver uses SQLite (bun:sqlite) for persisted materialised views. The schema is defined in <code>src/db/schema.sql</code> and is ported from the original frontend SQLite schema.
  </p>

  <hr />

  <h2>Core Tables</h2>

  <h3>entities</h3>
  <p>The base table for all entities (spaces, rooms, messages, users). Every entity has a unique ID (DID or ULID) and belongs to a stream.</p>
  <pre><code>create table entities (
  id text primary key,          -- did or ulid
  stream_id text not null,      -- did
  room text,                    -- ulid, references room id
  sort_idx text,                -- mutable timeline ordering index
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h3>edges</h3>
  <p>Directed, labelled edges between entities. Used for membership (joinedSpace), admin status, room linking, forwarding, and more.</p>
  <pre><code>create table edges (
  head text not null,
  tail text not null,
  label text not null,
  payload text,
  created_at integer not null,
  updated_at integer not null,
  primary key (head, tail, label)
);</code></pre>

  <h2>Materialised View Tables</h2>

  <h3>comp_space</h3>
  <p>Space-global config, handle, backfill cursor, and join policy. One row per space.</p>
  <pre><code>create table comp_space (
  entity text primary key,
  hidden integer default 0,
  handle text,
  handle_provider text,
  backfilled_to integer default 0,
  sidebar_config text not null default '&#123;"categories": []&#125;',
  allow_public_join integer,
  allow_member_invites integer,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h3>comp_room</h3>
  <p>Room metadata: label (channel/thread/page), default_access, and soft-delete flag.</p>
  <pre><code>create table comp_room (
  entity text primary key,
  label text,                   -- "space.roomy.channel", "space.roomy.thread", etc.
  default_access text check(default_access in ('readwrite', 'read', 'none')) default 'readwrite',
  deleted integer default 0,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h3>comp_info</h3>
  <p>Display info (name, avatar, description, banner, pronouns, website) for any entity.</p>
  <pre><code>create table comp_info (
  entity text primary key,
  name text,
  avatar text,
  description text,
  banner text,
  pronouns text,
  website text,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h3>comp_content</h3>
  <p>Message content: raw data blob with MIME type and canonical timestamp.</p>
  <pre><code>create table comp_content (
  entity text primary key,
  mime_type text,
  data blob,
  last_edit text not null,
  timestamp integer,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h3>comp_user</h3>
  <p>User records: DID to handle mapping.</p>
  <pre><code>create table comp_user (
  did text primary key,
  handle text,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h2>Embed Tables</h2>

  <p>Rich media embeds attached to messages:</p>
  <ul>
    <li><strong>comp_embed_image</strong> — Image embeds with dimensions, blurhash, alt text</li>
    <li><strong>comp_embed_video</strong> — Video embeds with dimensions, length, blurhash</li>
    <li><strong>comp_embed_file</strong> — File attachments with name and size</li>
    <li><strong>comp_embed_link</strong> — Link embeds with preview toggle</li>
    <li><strong>comp_embed_link_data</strong> — Cached enriched embed data (title, description, image) fetched asynchronously</li>
  </ul>

  <h2>Read State</h2>

  <h3>comp_last_read</h3>
  <p>Per-room read position (legacy, being replaced by read_positions).</p>
  <pre><code>create table comp_last_read (
  entity text primary key,
  last_read integer not null,
  unread_count integer,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h3>read_positions</h3>
  <p>Per-user, per-room read positions. The appserver is the source of truth for read state.</p>
  <pre><code>create table read_positions (
  user_did    text not null,
  room_id     text not null,
  seen_up_to  text not null,
  unread_count integer not null default 0,
  updated_at  integer not null,
  primary key (user_did, room_id)
);</code></pre>

  <h2>Roles and Permissions</h2>

  <h3>roles</h3>
  <p>Role definitions within a space.</p>
  <pre><code>create table roles (
  id text primary key,
  stream_id text not null,
  name text,
  avatar text,
  description text,
  deleted integer not null default 0
);</code></pre>

  <h3>member_roles</h3>
  <p>Many-to-many mapping of users to roles within a space.</p>
  <pre><code>create table member_roles (
  user_id text not null,
  role_id text not null,
  stream_id text not null,
  primary key (user_id, role_id)
);</code></pre>

  <h3>role_rooms</h3>
  <p>Per-room permissions granted by a role.</p>
  <pre><code>create table role_rooms (
  role_id text not null,
  room_id text not null,
  stream_id text not null,
  permission text not null check(permission in ('read', 'readwrite')),
  primary key (role_id, room_id)
);</code></pre>

  <h2>Activity Feed</h2>

  <h3>activity_item</h3>
  <p>Materialised activity feed items. One row per room that has seen at least one message. Upserted on every createMessage event.</p>
  <pre><code>create table activity_item (
  room_id text primary key,
  space_id text not null,
  is_thread integer not null default 0,
  parent_channel_id text,
  parent_channel_name text,
  last_activity_at integer not null,
  recent_message_ids text not null default '[]',
  room_name text,
  space_name text,
  space_avatar text,
  created_at integer not null,
  updated_at integer not null
);</code></pre>

  <h2>Other Tables</h2>

  <ul>
    <li><strong>comp_bans</strong> — Banned users per space</li>
    <li><strong>comp_invite</strong> — Active invite tokens per space</li>
    <li><strong>comp_user_personal_stream</strong> — Cache of user DID → personal stream DID</li>
    <li><strong>comp_discord_origin</strong> — Discord bridge origin tracking</li>
    <li><strong>comp_page_edits</strong> — Page edit history</li>
    <li><strong>comp_comment</strong> — Page comments</li>
    <li><strong>comp_reaction</strong> — Message reactions (emoji per user per message)</li>
    <li><strong>comp_calendar_link / comp_calendar_event</strong> — OpenMeet calendar integration</li>
    <li><strong>materialization_cursor</strong> — Per-stream materialization cursor tracking</li>
    <li><strong>roomy_schema_version</strong> — Schema version tracking for migration</li>
  </ul>

  <h2>Key Indexes</h2>

  <ul>
    <li><code>idx_entities_stream_id</code> — Filter entities by stream</li>
    <li><code>idx_entities_sort_idx</code> — Timeline ordering</li>
    <li><code>idx_entities_room</code> — Room-scoped entity lookups</li>
    <li><code>idx_entities_room_sort</code> — Room-scoped sort_idx lookups (unread counts, watermarks)</li>
    <li><code>idx_edges_label</code> — Edge label lookups</li>
    <li><code>idx_comp_room_label</code> — Room type filtering</li>
    <li><code>idx_activity_item_global</code> — Global activity feed ordering</li>
    <li><code>idx_activity_item_space</code> — Per-space activity feed ordering</li>
  </ul>
</div>
