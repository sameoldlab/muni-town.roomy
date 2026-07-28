# Migration Plan: Rich Text → Blocks + Facets

**Date:** 2026-07-27
**Status:** Draft for team review
**Depends on:** `docs/rich-text-representation-research.md` (the research document establishing Option D — Leaflet-style blocks + facets)

---

## 1. Goal

Migrate Roomy's message rich-text representation from opaque markdown strings (`Content { mimeType: "text/markdown", data: bytes }`) to the Leaflet-style **blocks + facets** structured model, with blocks and facets both declared as **open unions**. Mentions currently carried in a sidecar `space.roomy.extension.mentions.v0` extension fold into `#didMention` facets. Internal links currently re-parsed from markdown become facets. This unifies the message body into one structured, byte-addressable, gracefully-degrading representation.

The target shape (from the research doc):

```jsonc
// space.roomy.richtext.document — the new message body
{
  "$type": "space.roomy.richtext.document",
  "blocks": [
    { "$type": "space.roomy.richtext.blocks#text",
      "text": "Hey @alice check https://roomy.space/did:plc:...",
      "facets": [
        { "index": {"byteStart":4,"byteEnd":10}, "features": [
          {"$type":"space.roomy.richtext.facet#didMention","did":"did:plc:alice"}
        ]},
        { "index": {"byteStart":17,"byteEnd":46}, "features": [
          {"$type":"space.roomy.richtext.facet#link","uri":"https://roomy.space/did:plc:..."},
          {"$type":"app.bsky.richtext.facet#link","uri":"https://roomy.space/did:plc:..."}
        ]}
      ] }
  ]
}
```

---

## 2. Current-state surface (the full migration footprint)

This is the complete, verified inventory of every code path that touches message bodies. Every item below must be updated or explicitly decided to stay on the old path.

### 2.1 SDK schema layer — the source of truth

| File | Role | Migration touchpoint |
|---|---|---|
| `packages/sdk/src/schema/primitives.ts:91-95` | `Content` type = `{ mimeType: string, data: Bytes }` | Add a new `RichTextDocument` type (blocks array); keep `Content` as the envelope but accept the new mimeType. |
| `packages/sdk/src/schema/events/message.ts:15-21` | `CreateMessageSchema` — `body: Content` | The schema must accept the new body shape (blocks+facets). |
| `packages/sdk/src/schema/events/message.ts:23-165` | `CreateMessage` materializer — writes `comp_content (entity, mime_type, data, last_edit, timestamp)` from `event.body.mimeType` + `event.body.data.buf` | Must serialize the new structured body into the `data` blob (CBOR/JSON) and set the new mimeType. |
| `packages/sdk/src/schema/events/message.ts:168-337` | `EditMessage` materializer — same `comp_content` upsert on edit | Same change as CreateMessage. |
| `packages/sdk/src/schema/extensions/message.ts:103-112` | `Mentions` extension = `{ mentions: string[] }` sidecar | To be deprecated; mentions fold into `#didMention` facets. |
| `packages/sdk/src/schema/lexiconGen.ts` | Converts ArkType schemas → ATProto Lexicon JSON | New `space.roomy.richtext.*` lexicons must flow through this generator. |
| `packages/sdk/src/operations/message.ts:62-130` | `createMessage()` — constructs event with `body: { mimeType: "text/markdown", data: toBytes(...) }` and sets `space.roomy.extension.mentions.v0` | Change body construction; fold mentions into facets. |
| `packages/sdk/src/operations/message.ts:174-211` | `editMessage()` — same body construction | Same change. |

### 2.2 Appserver — materialization, queries, embeds, push

| File | Role | Migration touchpoint |
|---|---|---|
| `packages/appserver/src/db/schema.sql:113-121` | `comp_content` table — `mime_type text, data blob` | The `data` blob will hold JSON/CBOR-encoded blocks+facets for new messages; old rows keep markdown. No schema change needed (blob is opaque), but the version bump + migration logic matters. |
| `packages/appserver/src/db/content.ts:17-27` | `decodeContent(mime, data)` — UTF-8 for `text/*`, base64 otherwise | Add a branch for the new mimeType: decode the JSON/CBOR blocks structure, not a flat string. |
| `packages/appserver/src/materialization/applyBatch.ts:295-314` | Post-materialization side-effect: decodes body via `decodeContent`, calls `detectAndStoreLinks(db, messageId, content)` to extract URLs for embed enrichment | **Critical change:** URL extraction must read `#link` facets from the structured body instead of regex-scanning decoded markdown text. |
| `packages/appserver/src/embed/enricher.ts:57,388-414` | `extractUrls(text)` + `detectAndStoreLinks(db, messageId, content)` — regex URL extraction from text | Replace text-regex URL extraction with facet scanning (read `#link` facet `uri` fields). |
| `packages/appserver/src/materialization/toAppliedEvent.ts:32-79` | Extracts `mentions` from `space.roomy.extension.mentions.v0` extension into `AppliedEvent.details.mentions` for invalidation/push | Extract mentions from `#didMention` facets in the structured body instead of the sidecar extension. |
| `packages/appserver/src/push/evaluate.ts:85-96` | Reads `comp_content`, decodes, calls `stripMarkdownToPlaintext(raw)`, truncates to 120 chars for push notification body | Replace markdown stripping with structured-body plaintext extraction (concatenate block `text` fields). |
| `packages/appserver/src/push/plaintext.ts:1-79` | `stripMarkdownToPlaintext(input)` — regex-based markdown→plaintext stripper | Replaced by a blocks→plaintext extractor; this file is deleted or repurposed. |
| `packages/appserver/src/queries/activityFeed.ts:199-250` | `selectMessages`-equivalent: reads `comp_content.mime_type` + `data`, calls `decodeContent`, produces `content` string in `MessageDto` | Must produce the structured body (or a rendered string) for the new mimeType. |
| `packages/appserver/src/handlers/space.roomy.message.getMessage.ts` | Single-message query → `selectMessages` → `prioritiseLinksForRead` | Indirectly affected via `selectMessages` + `decodeContent` changes. |
| `packages/appserver/src/handlers/space.roomy.room.getMessages.ts` | Paginated message history → `selectMessages` → `prioritiseLinksForRead` | Same. |
| `packages/appserver/src/materialization/roomyProfile.ts` | Profile records — **not message bodies**. No change. | No change. |
| `packages/appserver/lexicons/space/roomy/user/*` | Profile lexicons only — no message body definitions. | No change (but the new `space.roomy.richtext.*` lexicons land alongside these). |

### 2.3 app-lite — authoring, rendering, enrichment

| File | Role | Migration touchpoint |
|---|---|---|
| `packages/app-lite/src/lib/components/chat/ChatInput.svelte:78-96` | TipTap Editor setup; `onUpdate` calls `ctx.editor.storage.markdown.getMarkdown()` to extract markdown on every keystroke | Replace markdown extraction with a `proseMirrorDocToRoomyBlocks(editor.getJSON())` call. |
| `packages/app-lite/src/lib/components/chat/ChatInputArea.svelte:250-278` | Send orchestration: builds `space.roomy.extension.mentions.v0` sidecar, hardcodes `mimeType: "text/markdown"` | Send blocks+facets body; fold mentions into `#didMention` facets (drop the sidecar). |
| `packages/app-lite/src/lib/mutations/message.ts:4-74` | `sendMessage`/`editMessage` — body = `{ mimeType: "text/markdown", data: toBytes(...) }`, mentions as separate extension | Body construction changes to blocks+facets; mentions become facets. |
| `packages/app-lite/src/lib/components/chat/MessageContent.svelte` | Renders message content (calls `renderMarkdownSanitized`) | Branch on mimeType: new bodies render from blocks+facets; old markdown bodies keep the existing path. |
| `packages/design/src/utils/markdown.ts:1-91` | `renderMarkdownSanitized`, `renderMarkdownPlaintext`, `renderInlineMarkdown` — `marked` + DOMPurify + LRU cache | Keep for legacy markdown rendering; add a new `renderBlocks(blocks)` renderer for structured bodies. |
| `packages/app-lite/src/lib/components/chat/embeds/enrich-internal-links.ts` | DOM-walks rendered markdown HTML to find `a[data-roomy-internal-link]` and replaces with `SpaceRoomBadge` components | For structured bodies, read `#link`/`#roomRef` facets directly — no DOM walk needed. |
| `packages/app-lite/src/lib/components/chat/embeds/prefetch-link-summaries.ts:46-100` | Re-renders markdown to HTML to find internal-link targets for cache warming | Read `#link`/`#roomRef` facets directly from the structured body. |
| `packages/app-lite/src/lib/components/chat/embeds/SpaceRoomBadge.svelte` | Badge component for internal space/room links | No change to the component; it's fed by the enrichment action, which changes its data source. |
| `packages/app-lite/src/lib/tiptap/editor.ts` | TipTap extensions: `initUserMention`, `initSpaceContextMention` — render mentions as `<a href=/user/{did}>` nodes | Mention rendering in the editor stays (it's the editor's own DOM); the *serialization* to facets changes. |
| `packages/app-lite/src/lib/tiptap/mentions.ts:1-20` | `extractMentionDids(editor)` — walks ProseMirror doc for userMention nodes | Replaced by the blocks+facets serializer that emits `#didMention` facets directly. |
| `packages/app-lite/src/lib/tiptap/RichTextLink.ts` | Custom Link extension with markdown link input/paste rules | Link marks become `#link` facets in serialization; the editor extension itself can stay. |
| `packages/app-lite/src/tiptap-markdown.d.ts` | Type augmentation for `tiptap-markdown`'s `getMarkdown()` | Either removed (if tiptap-markdown is dropped) or kept alongside the new serializer. |
| `packages/app-lite/src/lib/config.ts` | App config — no direct body/mimeType reference | No change. |

### 2.4 Discord bridge — bidirectional translation

| File | Role | Migration touchpoint |
|---|---|---|
| `packages/discord-bridge/src/services/message-ingestion.ts:190-235` | Discord→Roomy: constructs `createMessage` with `mimeType: "text/markdown"`, `data: toBytes(resolvedContent)`, plus extensions (authorOverride, timestampOverride, discordMessageOrigin, attachments). Does **not** set the mentions extension. | Emit blocks+facets body; resolve Discord mentions into `#didMention` facets instead of markdown link syntax. |
| `packages/discord-bridge/src/services/message-edit-delete.ts:77-118` | Discord→Roomy edit: constructs `editMessage` with `mimeType: "text/markdown"`, resolves mentions inline | Same change as ingestion. |
| `packages/discord-bridge/src/services/mention-resolver.ts:43-80` | `resolveMentions(content, mentions, ctx)` — replaces `<@12345>` → `[@DisplayName]()`, `<#12345>` → `[#Name](roomyUlid)` in the markdown string | Produce `#didMention` and `#roomRef`/`#link` facets with byte offsets instead of inlining markdown link syntax. |
| `packages/discord-bridge/src/services/roomy-event-router.ts:47-60` | `decodeBody(body)` — only handles `text/markdown` and `text/plain`, returns `undefined` for others (skips bridging) | Add handling for the new structured body mimeType; render blocks+facets → plain text (or Discord markdown) for the webhook. |
| `packages/discord-bridge/src/services/roomy-event-router.ts:170-288` | `#handleCreateMessage` — decodes body, sends `content` string to Discord via webhook | Decode structured body to a Discord-renderable string (Discord uses its own markdown variant). |
| `packages/discord-bridge/src/services/roomy-event-router.ts:290-357` | `#handleEditMessage` — same decode + Discord edit | Same. |

---

## 3. Design decisions to settle before implementation

These are the cross-cutting decisions that affect every slice. They must be decided first because every phase depends on them.

### 3.1 Wire encoding: JSON string vs CBOR bytes

The current `Content.data` is a `Bytes` blob (CBOR-encoded). The new structured body could be:
- **(a)** A JSON string encoded as UTF-8 bytes with `mimeType: "application/vnd.roomy.richtext+json"` — simplest, human-debuggable, matches Leaflet/OXA (which store text+facets as JSON in CBOR maps).
- **(b)** A CBOR map with `mimeType: "application/vnd.roomy.richtext+cbor"` — more compact, native to ATProto's data model, but harder to inspect.

**Recommendation:** JSON string (option a) inside the existing `Bytes` envelope, mirroring how Leaflet stores its blocks. The `Content` envelope stays `{ mimeType, data }`; only the decoded payload changes shape. This minimizes structural change and keeps debuggability.

### 3.2 The `comp_content.data` blob in the appserver DB

Today `comp_content.data` stores the raw body bytes. For the new format it stores the JSON-encoded blocks+facets. `decodeContent` must branch:
- `text/markdown`, `text/plain`, `text/html` → UTF-8 string (legacy).
- `application/vnd.roomy.richtext+json` → UTF-8 string (JSON), parsed into a structured object by callers that need structure, returned as-is (string) to callers that just need to pass it through to the client.

**Recommendation:** Keep `comp_content` schema unchanged (opaque blob). The mimeType discriminates. Add a `decodeRichTextBody(mime, data): RichTextDocument | string` helper that returns the structured object for the new mimeType and the legacy string for old mimeTypes.

### 3.3 Backward compatibility: coexistence vs backfill

Two strategies for existing markdown messages:
- **(a) Coexistence (lazy):** keep old messages as `text/markdown` forever; renderers branch on mimeType. New messages use the structured format. No data migration needed.
- **(b) Backfill:** convert all existing markdown messages to blocks+facets (one `text` block with `#link`/`#didMention` facets derived by running the existing `marked` parser once per message). One-time migration, then the legacy render path can eventually be removed.

**Recommendation:** Start with **coexistence** (renderers branch on mimeType). Plan a **backfill** as a separate, optional follow-up once the new path is proven. This de-risks the migration: the old path stays functional throughout, and backfill is a pure data transformation that can run at leisure. The legacy render path is kept until backfill is complete, then removed as cleanup.

### 3.4 Open unions: how "open"

The team wants blocks and facets to be open unions. In ATProto lexicons, a union's `refs` array is the known set; `"closed": false` (or omitting `closed`) signals that consumers should tolerate unknown `$type`s. Concretely:
- **Blocks:** `space.roomy.richtext.blocks#block` is a union of known block types (`#text`, `#header`, `#blockquote`, `#code`, `#orderedList`, `#unorderedList`, `#image`, `#horizontalRule`) declared `closed: false`. Unknown block `$type`s are dropped by renderers (their `text` is lost unless the block carries a `text` fallback).
- **Facets:** `space.roomy.richtext.facet#features` is a union of known feature types (`#bold`, `#italic`, `#strikethrough`, `#code`, `#link`, `#didMention`, `#atMention`, `#highlight`, `#underline`, `#roomRef`) declared `closed: false`. Unknown feature `$type`s are ignored — the plain `text` carries through.

**Recommendation:** Mirror Leaflet's lexicon structure exactly — it is the proven, open-union implementation of this model. Use `"closed": false` on both unions.

### 3.5 Cross-namespace compatibility facets

Per the research doc: emit `app.bsky.richtext.facet#link` alongside `space.roomy.richtext.facet#link` so Bluesky-ecosystem readers render links without understanding Roomy. Do the same for mentions where a DID is involved (`app.bsky.richtext.facet#mention`).

**Recommendation:** Adopt this from day one. It costs one extra feature object per link/mention and buys interop.

---

## 4. Phased plan

Each phase has a clear dependency: Foundation must land first (everyone consumes the lexicon + converters). Then SDK Schema, Appserver, App-lite, and Discord Bridge can proceed largely in parallel (they each depend on Foundation, not on each other). Data Migration and Verification come last.

```
 ┌─────────────┐
 │ Foundation  │  lexicon + converters (everyone depends on this)
 └──────┬──────┘
        │
   ┌────┴─────┬───────────┬──────────────┬──────────────┐
   ▼          ▼           ▼              ▼              ▼
 SDK Schema  Appserver   App-lite    Discord Bridge  (parallel)
   └────┬─────┴───────────┴──────────────┴──────────────┘
        │
        ▼
 ┌─────────────────┐
 │ Data Migration   │  backfill (optional, after new path proven)
 └────────┬────────┘
          ▼
 ┌─────────────┐
 │ Verification │  typecheck + tests + E2E
 └─────────────┘
```

### Phase 1 — Foundation (lexicon + converters)

**Goal:** Define the new representation and the conversion utilities that every other phase consumes. This is the shared contract; nothing else can start until it's settled.

**Deliverables:**

1. **`space.roomy.richtext.*` lexicon namespace** — new files under `packages/appserver/lexicons/space/roomy/richtext/` (and mirrored in the SDK schema for lexicon generation):
   - `document.json` — the root record: `{ blocks: [#block] }`.
   - `blocks.json` — `#block` open union (`#text`, `#header`, `#blockquote`, `#code`, `#orderedList`, `#unorderedList`, `#image`, `#horizontalRule`), `closed: false`. Each text-bearing block: `{ text: string, facets?: [facet] }` + block-specific props (e.g. `level` on header, `language` on code).
   - `facet.json` — `#main` facet `{ index: #byteSlice, features: [#feature] }`, `#byteSlice` `{ byteStart, byteEnd }`, and the open feature union (`#bold`, `#italic`, `#strikethrough`, `#code`, `#link`, `#didMention`, `#atMention`, `#highlight`, `#underline`, `#roomRef`), `closed: false`.
   - `#roomRef` carries `{ spaceId: string, roomId?: string }` for internal links — eliminates the URL re-parse.

2. **SDK types** — ArkType definitions in a new `packages/sdk/src/schema/richtext/` module (or in `primitives.ts`): `RichTextDocument`, `Block`, `Facet`, `FacetFeature`, `ByteSlice`. Exported from `packages/sdk/src/schema/index.ts`.

3. **Markdown ↔ blocks+facets converter** — a new module (e.g. `packages/sdk/src/richtext/convert.ts` or in the app-lite tiptap layer) with:
   - `markdownToBlocks(md: string): Block[]` — parse markdown via `marked` tokens, emit blocks with `#link`/`#bold`/`#italic`/`#code` facets. Used for backfill and for the Discord bridge transition.
   - `proseMirrorDocToBlocks(doc: ProseMirrorJSON): Block[]` — the TipTap-native path; flatten the editor's JSON tree into blocks+facets (the OXA tree→facets walk).
   - `blocksToProseMirrorDoc(blocks: Block[]): ProseMirrorJSON` — the inverse, for re-editing structured messages in TipTap.
   - `blocksToPlaintext(blocks: Block[]): string` — concatenate block `text` fields; for push notifications and character counting.
   - `extractFacetUrls(blocks: Block[]): string[]` — collect `#link` facet `uri` values; replaces regex URL extraction in the appserver.

4. **Wire-encoding helper** — `serializeBody(blocks: Block[]): { mimeType, data }` and `deserializeBody(mime, data): Block[] | string`. Encodes blocks as JSON UTF-8 bytes with `mimeType: "application/vnd.roomy.richtext+json"`; returns the legacy string for old mimeTypes.

**Acceptance:** Lexicons validate against the ATProto lexicon schema. The converter round-trips a representative set of Roomy messages (plain text, mentions, links, bold/italic, code blocks, lists, internal links) without loss. `blocksToPlaintext` produces the same output as the current `stripMarkdownToPlaintext` for the test corpus.

### Phase 2 — SDK schema (events + materializers + operations)

**Goal:** Make the event schema accept and the materializer store the new body shape. Mentions fold into facets.

**Deliverables:**

1. **`CreateMessageSchema` / `EditMessageSchema`** (`packages/sdk/src/schema/events/message.ts:15-21,168-177`) — `body` accepts the new `Content` with the new mimeType. The schema stays permissive (`Content` is `{ mimeType: string, data: Bytes }`); the constraint is the mimeType value, not the shape. No structural schema change needed if we keep the `Content` envelope — but add a typed `RichTextBody` helper for callers.

2. **`CreateMessage` / `EditMessage` materializers** (`message.ts:23-165,179-337`) — the `comp_content` insert already writes `event.body.mimeType` + `event.body.data.buf` generically; **no change needed** as long as the body bytes are the JSON-encoded blocks. Verify this holds.

3. **`#didMention` facet type** — add to the facet lexicon and SDK types. Update `toAppliedEvent.ts:51-56` (appserver) to extract mentions from `#didMention` facets in the decoded body instead of the `space.roomy.extension.mentions.v0` sidecar. **This is an appserver change but it's logically part of the mentions fold — coordinate.**

4. **`createMessage()` / `editMessage()` operations** (`packages/sdk/src/operations/message.ts:62-130,174-211`) — accept a `blocks: Block[]` (or `body: Block[]`) parameter instead of (or alongside) the string `body`. Serialize to the new mimeType. Fold `options.mentions` into `#didMention` facets within the blocks instead of the sidecar extension.

5. **Deprecate `space.roomy.extension.mentions.v0`** — mark deprecated in `packages/sdk/src/schema/extensions/message.ts:103-112`. Keep the type for the transition window; remove after all producers (app-lite, bridge) emit facets and all consumers (appserver push/invalidation) read facets.

**Acceptance:** `bun test --cwd packages/appserver` (materializer tests) passes with new-format bodies. SDK unit tests pass. The `createMessage` operation produces a valid event with the new mimeType and `#didMention` facets.

### Phase 3 — Appserver (materialization, embeds, push, queries)

**Goal:** The appserver correctly stores, reads, and derives from structured bodies.

**Deliverables:**

1. **`decodeContent` / new `decodeRichTextBody`** (`packages/appserver/src/db/content.ts:17-27`) — add a branch for `application/vnd.roomy.richtext+json`: decode UTF-8 JSON into a `RichTextDocument`. Callers that need the structured form use the new helper; callers that just pass bytes through (e.g. `selectMessages` producing the wire `content`) can keep the string form.

2. **`selectMessages` / `MessageDto.content`** (`packages/appserver/src/queries/activityFeed.ts:199-250` and the message query path) — for the new mimeType, the `content` field carried in the DTO should be the JSON string of the blocks (the client parses it). For old mimeTypes, keep the markdown string. The client branches on mimeType.

3. **Embed link detection** (`packages/appserver/src/materialization/applyBatch.ts:295-314`, `packages/appserver/src/embed/enricher.ts:57,388-414`) — **the biggest appserver change.** Replace `extractUrls(decodeContent(...))` with:
   - If mimeType is the new format: parse blocks, call `extractFacetUrls(blocks)`.
   - If mimeType is legacy markdown: keep the existing `extractUrls` regex path.
   - `detectAndStoreLinks` stays the same (it takes URLs); only the URL source changes.

4. **Mentions extraction** (`packages/appserver/src/materialization/toAppliedEvent.ts:32-79`) — extract `mentions` from `#didMention` facets in the decoded structured body (when mimeType is new), falling back to the sidecar extension (when legacy). The `mentions` array in `AppliedEvent.details` is consumed by the push dispatcher.

5. **Push notification plaintext** (`packages/appserver/src/push/evaluate.ts:85-96`, `packages/appserver/src/push/plaintext.ts:1-79`) — for new-format bodies, use `blocksToPlaintext(blocks)` instead of `stripMarkdownToPlaintext(markdown)`. Keep `stripMarkdownToPlaintext` for legacy bodies. Eventually delete `plaintext.ts` once backfill is complete.

6. **`comp_content` schema** — no change (opaque blob + mimeType discriminates). Bump `roomy_schema_version` in `packages/appserver/src/db/db.ts` only if a migration runs; with coexistence (no backfill), no bump is needed.

**Acceptance:** `bun test --cwd packages/appserver` passes (all ~240 tests). Embed sweeper tests pass with new-format bodies (URLs come from facets). Push tests pass with structured-body plaintext extraction. The `getMessage` / `getMessages` handlers return new-format bodies correctly.

### Phase 4 — app-lite (authoring, rendering, enrichment)

**Goal:** The client authors and renders the new format; the markdown path remains for legacy messages.

**Deliverables:**

1. **TipTap serialization** (`packages/app-lite/src/lib/components/chat/ChatInput.svelte:78-96`) — replace `ctx.editor.storage.markdown.getMarkdown()` with `proseMirrorDocToBlocks(ctx.editor.getJSON())`. The `onUpdate` callback now produces a `Block[]` instead of a markdown string. The `content` state variable changes type from `string` to `Block[]` (or the serialized JSON string).

2. **Send path** (`packages/app-lite/src/lib/components/chat/ChatInputArea.svelte:250-278`, `packages/app-lite/src/lib/mutations/message.ts:4-74`) — construct the body as `{ mimeType: "application/vnd.roomy.richtext+json", data: toBytes(new TextEncoder().encode(JSON.stringify(blocks))) }`. Mentions are folded into `#didMention` facets during the `proseMirrorDocToBlocks` conversion (the editor already has mention nodes with DIDs); the `space.roomy.extension.mentions.v0` sidecar is dropped.

3. **`extractMentionDids`** (`packages/app-lite/src/lib/tiptap/mentions.ts:1-20`) — the mention extraction logic moves into `proseMirrorDocToBlocks` (it emits `#didMention` facets). The standalone function is deprecated.

4. **Rendering** (`packages/app-lite/src/lib/components/chat/MessageContent.svelte`) — branch on mimeType:
   - New format: parse JSON blocks, render via a new `BlocksRenderer` Svelte component (one component per block type: `TextBlock`, `HeaderBlock`, `CodeBlock`, `BlockquoteBlock`, `ListBlock`). Inline formatting from facets is applied within `TextBlock` (bold/italic/code/link/mention).
   - Legacy markdown: keep the existing `renderMarkdownSanitized` + `enrichInternalLinks` path.

5. **Internal-link enrichment** (`packages/app-lite/src/lib/components/chat/embeds/enrich-internal-links.ts`, `prefetch-link-summaries.ts`) — for new-format bodies, read `#link`/`#roomRef` facets directly from the blocks (no DOM walk, no `ROOMY_DOMAINS` sync). For legacy markdown, keep the DOM-walk path. The `SpaceRoomBadge` component itself is unchanged.

6. **`tiptap-markdown` dependency** — can be removed from the authoring path (replaced by `proseMirrorDocToBlocks`), but keep it for the legacy markdown rendering path and for potential markdown paste handling. Revisit in cleanup.

**Acceptance:** `pnpm --filter app-lite check` passes (modulo pre-existing baseline errors). A message authored in the new format renders correctly (text, bold, italic, links, mentions, code, lists). A legacy markdown message still renders via the old path. Internal-link badges appear for both formats. `pnpm dev:local` E2E: send a message with a mention and an internal link, verify it renders with the badge and the mention anchor.

### Phase 5 — Discord bridge (bidirectional translation)

**Goal:** The bridge emits and consumes the new format. Discord's own markdown is the rendering target on the Roomy→Discord side.

**Deliverables:**

1. **Discord→Roomy ingestion** (`packages/discord-bridge/src/services/message-ingestion.ts:190-235`) — construct a `createMessage` event with blocks+facets body. Discord message content + resolved mentions become a single `#text` block with `#didMention` facets (for user mentions) and `#roomRef`/`#link` facets (for channel mentions). The `mention-resolver.ts` logic is reworked to produce facets with byte offsets instead of markdown link syntax.

2. **`resolveMentions`** (`packages/discord-bridge/src/services/mention-resolver.ts:43-80`) — instead of replacing `<@12345>` → `[@DisplayName]()` in the markdown string, scan the content for Discord mention patterns, record byte offsets, and emit `#didMention`/`#roomRef` facets. The display name is still substituted into the text (so Discord→Roomy messages show readable names), but the facet carries the DID/room ID.

3. **Discord→Roomy edit** (`packages/discord-bridge/src/services/message-edit-delete.ts:77-118`) — same change as ingestion: emit blocks+facets body.

4. **Roomy→Discord** (`packages/discord-bridge/src/services/roomy-event-router.ts:47-60,170-357`) — `decodeBody` must handle the new mimeType: parse blocks+facets, render to a Discord-suitable string (Discord markdown — bold, italic, code, links). Mentions render as Discord `<@did>` syntax if the DID maps to a bridged Discord user, otherwise as plain text. This is a `blocksToDiscordMarkdown(blocks)` converter.

5. **Bridge tests** (`packages/discord-bridge/src/__tests__/`) — update `message-ingestion.test.ts`, `roomy-event-router.test.ts`, `mention-resolver.test.ts` to assert on blocks+facets bodies instead of markdown strings.

**Acceptance:** `bun test` in the bridge package passes. A Discord message with mentions bridges to Roomy as a structured body with `#didMention` facets. A Roomy message with bold/links bridges to Discord as readable Discord markdown.

### Phase 6 — Data migration (coexistence first, backfill optional)

**Goal:** Existing markdown messages continue to work; backfill is a separate, optional step.

**Deliverables:**

1. **Coexistence (required)** — all renderers and consumers branch on mimeType. This is already part of phases 3–5; this phase item confirms the branch is present everywhere and the legacy path is fully functional.

2. **Backfill (optional, follow-up)** — a one-time migration script (`packages/appserver/scripts/backfill-richtext.ts` or an admin XRPC) that:
   - Iterates all `comp_content` rows with `mime_type = 'text/markdown'`.
   - Decodes each to a markdown string, runs `markdownToBlocks(md)`, re-encodes as JSON, updates the row with `mime_type = 'application/vnd.roomy.richtext+json'` and the new `data`.
   - Runs in batches (e.g. 1000 rows), idempotent (skips rows already migrated).
   - Can run while the appserver is live (row-level updates; coexistence rendering handles mixed states).

3. **Legacy path removal (after backfill)** — once backfill is complete and verified, remove `stripMarkdownToPlaintext`, the markdown render branch in `MessageContent`, the `extractUrls` regex path, and the `space.roomy.extension.mentions.v0` type. This is cleanup, gated on backfill completion.

**Acceptance:** After coexistence: mixed-format rooms render correctly (old markdown + new structured messages interleaved). After backfill (if run): all messages have the new mimeType; legacy render paths can be removed.

### Phase 7 — Verification

**Goal:** Proof that the deliverable works end to end.

**Deliverables:**

1. **Type checking:** `pnpm --filter app-lite check`, `pnpm --filter @roomy/appserver typecheck`, `pnpm --filter @roomy-space/sdk test` — diff error counts against the pre-existing baseline (3 app-lite, 36 appserver per AGENTS.md).
2. **Appserver unit tests:** `bun test --cwd packages/appserver` — all ~240 tests pass.
3. **SDK tests:** `pnpm --filter @roomy-space/sdk test` — all pass.
4. **Bridge tests:** `bun test` in `packages/discord-bridge` — all pass.
5. **E2E smoke test:** `pnpm dev:local` → open app-lite in browser → send a message with: plain text, bold, a link, an `@mention`, an internal `[/room link]`, a code block, a list. Verify all render correctly. Verify the mention triggers notification routing (check appserver logs / push evaluation). Verify the Discord bridge round-trips the message in both directions.
6. **Embed sweeper:** send a message with a URL; verify `detectAndStoreLinks` picks it up from the `#link` facet and the embed card appears after the sweeper enriches it.

---

## 5. Cross-cutting risks and mitigations

| Risk | Mitigation |
|---|---|
| **Byte-offset correctness.** Facets use UTF-8 byte offsets; JS uses UTF-16. Off-by-N bugs in the converter corrupt facet ranges. | Centralize all byte-offset computation in the converter module (`proseMirrorDocToBlocks`). Add a property-based test: `blocksToPlaintext(blocks).length === sum(block.text.length)` and facet ranges are within bounds. Test with emoji and multi-byte CJK characters. |
| **Mentions regression.** Push notifications, invalidation, and the app-lite send path all currently read the sidecar extension. If any consumer is missed, mentions silently stop working. | The `toAppliedEvent.ts` change is the single appserver consumer of mentions for push. Audit all `grep` hits for `extension.mentions` across the monorepo before removing the sidecar. Keep the sidecar during the transition window; have `toAppliedEvent` read facets first, fall back to sidecar. |
| **Embed enrichment regression.** `detectAndStoreLinks` currently regex-scans decoded text. If the facet-based extraction misses URLs that the regex caught (e.g. bare URLs without a `#link` facet), embeds stop appearing. | The `proseMirrorDocToBlocks` converter must emit `#link` facets for *all* URLs, including auto-linked bare URLs (TipTap's `RichTextLink` has `autolink: true`). For backfilled markdown, `markdownToBlocks` must run the same autolink detection. Add a test: feed messages with bare URLs, wrapped URLs, and markdown `[text](url)` — assert all produce `#link` facets. |
| **Discord round-trip fidelity.** Discord→Roomy→Discord must not lose content. Discord's markdown differs from Roomy's. | The `blocksToDiscordMarkdown` converter maps block types to Discord's markdown subset. Unknown blocks fall back to their `text`. Test the full round-trip with a representative Discord message set. |
| **`comp_content.data` size growth.** JSON blocks+facets are larger than raw markdown for simple messages (overhead of block/facet structure). | Measure: for typical chat messages (1–3 paragraphs, 1–2 links), the JSON is ~1.5–2× the markdown. Acceptable for chat; monitor. If it matters, switch to CBOR encoding (decision 3.1b) later. |
| **Legacy markdown render path bit-rot.** The `marked` + DOMPurify path stays for months during coexistence. | Keep it behind the mimeType branch; don't let it bit-rot by running legacy messages through it in tests until backfill is done. |

---

## 6. Sequencing and parallelism

- **Phase 1 (Foundation)** is the prerequisite for all others. Do it first, alone. ~2–3 days.
- **Phases 2–5 (SDK Schema, Appserver, App-lite, Discord Bridge)** can run **in parallel** after Foundation. They each depend only on Foundation, not on each other — with one coordination point: the mentions fold (Phase 2 item 3 + Phase 3 item 4) touches both SDK schema and appserver `toAppliedEvent`. Do that coordination item first within the parallel wave.
- **Phase 6 (Data Migration)** starts after Phases 2–5 are complete and smoke-tested. Coexistence is part of phases 2–5; backfill is a follow-up.
- **Phase 7 (Verification)** runs continuously but the final pass is after Phase 6.

Estimated timeline (assuming a team of 2–3): **~2 weeks** to coexistence (phases 1–5 + verification), backfill as a follow-up.

---

## 7. Open questions for the team

1. **`#roomRef` vs `#link` for internal links.** Should internal space/room references use a dedicated `#roomRef` facet (carrying `{ spaceId, roomId? }`, no URL parsing) or reuse `#link` with a `roomy.space` URL? `#roomRef` is cleaner and eliminates the `ROOMY_DOMAINS` sync; `#link` is simpler and already interop-compatible. **Recommendation:** `#roomRef` for first-class internal references, with a `#link` facet emitted alongside for external consumers.

2. **Drop `tiptap-markdown` entirely?** If the authoring path moves to `proseMirrorDocToBlocks`, the `tiptap-markdown` extension is only needed for markdown paste handling and the legacy render path. **Recommendation:** keep it for paste handling; remove from the authoring serialization path.

3. **Backfill timing.** Run backfill immediately after coexistence, or wait for a burn-in period? **Recommendation:** wait 1–2 weeks of coexistence in production, then backfill, then remove the legacy path.

4. **CBOR vs JSON for the wire encoding.** JSON is recommended for v1 (debuggability). Revisit if storage/size becomes a concern. Should the mimeType be `application/vnd.roomy.richtext+json` or registered more formally?

---

## 8. References

- Research document: `docs/.llm.rich-text-representation-research.md`
- Leaflet lexicons (the template): `mary-ext/atcute` `packages/definitions/leaflet/lexicons/pub/leaflet/` — `document.json`, `pages/linearDocument.json`, `blocks/text.json`, `richtext/facet.json`
- Bluesky facet lexicon: `bluesky-social/atproto` `lexicons/app/bsky/richtext/facet.json`
- OXA tree→facets rationale: `https://www.oxa.dev/articles/oxa-on-at-proto`
- Paul Frazee's facets rationale: `https://www.pfrazee.com/blog/why-facets`