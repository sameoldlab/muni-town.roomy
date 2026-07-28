# Rich Text Representation Research

**Date:** 2026-07-27
**Purpose:** Inform a decision on moving Roomy message bodies from `text/markdown` (string) to a structured JSON representation.

---

## 1. Current state in Roomy

Message bodies today are opaque markdown strings wrapped in a `{ mimeType, data }` blob:

```ts
// packages/sdk/src/schema/primitives.ts
export const Content = type({
  mimeType: type.string.describe("The mime type of the data field."),
  data: Bytes,            // base64-encoded bytes
}).describe("Content block: mime type + bytes payload");

// packages/sdk/src/schema/events/message.ts
const CreateMessageSchema = type({
  $type: "'space.roomy.message.createMessage.v0'",
  body: Content.describe(
    "The main content of the chat message. Usually this uses the text/markdown mime type.",
  ),
  extensions: MessageExtensionMap,  // mentions, attachments, etc.
});
```

The client (`packages/app-lite`) round-trips this through TipTap:

- **Authoring:** TipTap editor → `tiptap-markdown` → markdown string → `{ mimeType: "text/markdown", data: toBytes(...) }`.
- **Rendering:** markdown string → `marked` → DOMPurify → sanitized HTML, with post-processing to enrich internal links and prefetch link summaries.

Mentions are *not* carried in the markdown; they are lifted out of the TipTap document separately (`extractMentionDids`) and sent as a structured `space.roomy.extension.mentions.v0` extension alongside the body. The renderer therefore never knows about mentions from the text itself — it knows because a parallel structured field says so.

This split is the first crack in the markdown model: structured annotations (mentions) already live *beside* the text, not *in* it. Links and internal references are the opposite — they are embedded in the markdown and re-parsed out at render time (`enrich-internal-links.ts`, `prefetch-link-summaries.ts`).

### What the current model costs Roomy

1. **Re-parsing on every render.** Every message render re-runs `marked` + DOMPurify, then walks the DOM to find internal links. An LRU cache (`markdown.ts`) mitigates this, but the cache itself exists only because the representation forces parsing.
2. **Lost intent under degradation.** A client that doesn't run Roomy's exact markdown renderer will barf internal-link syntax (`[text](/did:plc:...)`) or lose the room/space badge enrichment entirely — it just sees a link.
3. **Mentions are already structured, inconsistently.** Mentions bypass the text model because markdown can't carry a DID. This proves the team already needs structure; the question is whether to make the whole body structured rather than splitting it.
4. **No byte-stable addressing.** There is no canonical way to point at "the third paragraph, the link in sentence two" — needed for quote replies, search snippets, or distributed annotation.

---

## 2. The general landscape: structured rich text representations

Structured rich text is an old problem. There are two broad families, and they differ on a single axis: **is formatting carried by a tree, or by flat annotations over a plain-text string?**

### 2.1 Tree-based document models

The document is a JSON tree of nodes (block nodes containing inline nodes containing text nodes), with formatting expressed as nested structure or as "marks" attached to text runs.

**ProseMirror / TipTap** (what Roomy already uses internally):
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This is " },
        { "type": "text", "marks": [{ "type": "strong" }], "text": "bold" },
        { "type": "text", "text": " and " },
        { "type": "text", "marks": [{ "type": "em" }], "text": "italic" }
      ]
    }
  ]
}
```
- ProseMirror's `Node.toJSON()` / `Node.fromJSON(schema, ...)` is the canonical serialization. The schema defines which nodes and marks may occur and how they nest.
- Marks are an array on text nodes, so overlapping formatting (bold ∩ italic) is a flat set, not a tree — this is the one place ProseMirror *avoids* nesting.
- The tree is schema-dependent: a consumer needs the schema (or a known subset) to interpret it. Unknown nodes have no defined fallback behavior.

**Lexical (Meta):** Same tree shape conceptually — an immutable tree of nodes (`ElementNode`, `TextNode`, `DecoratorNode`), serialized via `editor.getEditorState().toJSON()`. Text formatting is a packed bitmask (`__format`) plus style/`__mark` arrays. Like ProseMirror, it is schema-coupled and falls back to "ignore unknown nodes," with no text-level guarantee.

**Quill Delta:** A *flat* sequence of operations, not a tree, but it still encodes formatting inline:
```json
{
  "ops": [
    { "insert": "This is " },
    { "insert": "bold", "attributes": { "bold": true } },
    { "insert": " and " },
    { "insert": "italic", "attributes": { "italic": true } }
  ]
}
```
Deltas were designed for change-sets and operational transforms as much as for snapshots. The flat-op model composes cleanly for collaborative editing (and Yjs/Peritext CRDTs adopt similar ideas), but for a *stored* representation it carries formatting attributes alongside text, with no separate plain-text substratum.

#### Tree models: where they shine and where they hurt

| Strength | Weakness |
|---|---|
| Natural fit for block-level structure (lists, tables, embeds) | Schema-coupled: consumer needs the schema to render |
| Direct serialization of editor state (no conversion step) | No graceful text fallback — unknown node = missing content |
| Native to collaborative editing (CRDTs, OT) | Heavyweight for short chat messages; nesting overhead |
| Rich nesting (lists inside quotes inside callouts) | Harder to address by byte offset; harder to annotate externally |

### 2.2 Facet / annotation models

The document stores plain text as a single string. Formatting and semantics are carried by **facets**: byte-range annotations layered *on top* of the text. The text is the source of truth for what the user sees if nothing else is understood.

```json
{
  "text": "This is bold and italic text.",
  "facets": [
    { "index": { "byteStart": 8,  "byteEnd": 23 }, "features": [{ "$type": "#strong" }] },
    { "index": { "byteStart": 17,  "byteEnd": 23 }, "features": [{ "$type": "#emphasis" }] }
  ]
}
```

This is the model AT Protocol uses, and it is the relevant one for Roomy because Roomy records are AT Protocol records. See §3.

#### Facet models: where they shine and where they hurt

| Strength | Weakness |
|---|---|
| **Graceful fallback:** unknown facets drop to plain text, content survives | Block structure (lists, code blocks, headings) must be modeled separately — facets are inline-only |
| Byte-stable addressing → quote replies, search snippets, external annotation | Overlapping/nested formatting requires multiple facets on one range (no nesting) |
| Trivial plaintext extraction (`record.text`) and character counting | Editor must flatten its tree → text+facets on publish, and re-hydrate on edit |
| Validation is straightforward (byte ranges inside the string) | Slightly more work to author: you must compute byte offsets, not just write markup |
| Extensible by adding facet feature types to an open union | Text and facets can desync if a client mutates the string without re-deriving facets |

### 2.3 The synthesis used in practice: blocks + facets

Every production structured-text system on AT Protocol that needs block-level structure (headings, lists, quotes, images) combines the two: **block-level structure as a tree/array of typed blocks, inline formatting as facets over each block's `plaintext`/`text` string.** This keeps the graceful-fallback property at the inline level while still supporting rich blocks. This is exactly what Leaflet and OXA do (§3.2, §3.3).

---

## 3. ATProto lexicons: the concrete precedent

AT Protocol's data model is JSON/CBOR validated by Lexicons. The relevant question for Roomy is not "what's the best JSON shape in the abstract" but "what shape do AT Protocol records actually use, and what composes on the network."

### 3.1 Bluesky posts: `app.bsky.feed.post` + `app.bsky.richtext.facet`

The canonical, most-deployed example. From `lexicons/app/bsky/feed/post.json`:

```json
{
  "text": "The primary post content. May be an empty string, if there are embeds.",
  "facets": [ { "$type": "app.bsky.richtext.facet", "index": {...}, "features": [...] } ],
  "reply": { "root": {...}, "parent": {...} },
  "embed": { "$type": "app.bsky.embed.images", ... },
  "langs": ["en"],
  "createdAt": "2024-01-15T00:00:00.000Z"
}
```

And `lexicons/app/bsky/richtext/facet.json`:

```json
{
  "id": "app.bsky.richtext.facet",
  "defs": {
    "main": {
      "type": "object",
      "required": ["index", "features"],
      "properties": {
        "index": { "type": "ref", "ref": "#byteSlice" },
        "features": { "type": "array",
          "items": { "type": "union", "refs": ["#mention", "#link", "#tag"] } } }
      }
    },
    "mention": { "type": "object", "required": ["did"], "properties": { "did": { "type": "string", "format": "did" } } },
    "link":     { "type": "object", "required": ["uri"], "properties": { "uri": { "type": "string", "format": "uri" } } },
    "tag":      { "type": "object", "required": ["tag"], "properties": { "tag": { "type": "string", "maxLength": 640, "maxGraphemes": 64 } } },
    "byteSlice": { "type": "object", "required": ["byteStart", "byteEnd"], "properties": { "byteStart": {"type":"integer","minimum":0}, "byteEnd": {"type":"integer","minimum":0} },
      "description": "...Indices are zero-indexed, counting bytes of the UTF-8 encoded text..." }
  }
}
```

Key properties, all directly relevant to Roomy:

- **Plain `text` string is the substrate.** `text` is required; facets are optional annotations into it. A consumer that ignores facets renders `text` as plain text. This is the graceful-degradation guarantee.
- **Byte slices, UTF-8.** `byteStart`/`byteEnd` index into the UTF-8 byte sequence, *not* UTF-16 code units. JS clients must convert. This is a real footgun and a real correctness constraint.
- **Features are an open-ish union.** Bluesky's union is closed (`mention`, `link`, `tag`) because `app.bsky.*` is a curated namespace, but the *mechanism* supports open unions — other lexicons add their own facet feature types (Leaflet, OXA).
- **Mentions resolve to DIDs, not handles.** The text may show `@bob.com` but the facet carries `did:plc:...`. This is exactly the structured-mention problem Roomy already solved with a sidecar extension; facets fold it into the text model where it belongs.
- **Embeds are separate.** `embed` is a sibling union of `app.bsky.embed.*` (images, video, external, record). Media is not jammed into the text model.

Paul Frazee's "Why RichText facets" post frames the three problems this solves for a multi-client, decentralized network — which is precisely Roomy's situation (any client, any bridge, future third-party readers):

1. **Syntax barfing.** With markdown, a client that introduces `||spoiler||` or `{color=hex}...` causes every other client to render the raw syntax to users. With facets, an unknown feature is ignored and the plain text carries through cleanly.
2. **Parsing sucks.** Every consumer must parse markdown to extract mentions/links; custom syntax needs a parser in every language. Facets are JSON/CBOR — no parsing, and indexing (e.g. a mentions index) is a flat scan of `facets`, not a parse of prose.
3. **Character counting.** Microblogging and chat both care about length limits; with markdown you must strip syntax first, with facets the `text` length *is* the content length.

Frazee explicitly notes you can still use Markdown in your client: "You just need to run the parse step before publishing and turn the results into these facets." This is the migration story — the authoring UX can stay TipTap/Markdown, the *stored* representation becomes facets.

### 3.2 Leaflet: `pub.leaflet.*` — blocks + facets for long-form documents

Leaflet (`leaflet.pub`) is the most directly relevant precedent: it is an AT Protocol publishing app that needs block-level structure *and* graceful inline fallback. Its lexicons (sourced from `mary-ext/atcute`, `packages/definitions/leaflet/lexicons/`) implement the "blocks + facets" synthesis:

**Document** (`pub.leaflet.document`):
```json
{ "id": "pub.leaflet.document", "defs": { "main": {
  "type": "record", "key": "tid",
  "record": { "type": "object",
    "required": ["author", "pages", "title"],
    "properties": {
      "title": { "type": "string", "maxLength": 5000, "maxGraphemes": 500 },
      "author": { "type": "string", "format": "at-identifier" },
      "pages": { "type": "array",
        "items": { "type": "union", "refs": ["pub.leaflet.pages.canvas", "pub.leaflet.pages.linearDocument"] } }
} } } } }
```

**Linear document** (`pub.leaflet.pages.linearDocument`) — an array of typed blocks:
```json
"blocks": { "type": "array", "items": { "ref": "#block", "type": "ref" } }
// #block.block is a union of ~22 block types:
//   blockquote, bskyPost, button, code, header, horizontalRule, html,
//   iframe, image, imageGallery, math, membersOnlyDelimiter, orderedList,
//   page, poll, postsList, signup, standardSitePost, standardSitePublication,
//   text, unorderedList, website
```

**Text block** (`pub.leaflet.blocks.text`) — the inline layer is `plaintext` + `facets`:
```json
{ "id": "pub.leaflet.blocks.text", "defs": { "main": {
  "type": "object", "required": ["plaintext"],
  "properties": {
    "plaintext": { "type": "string" },
    "facets": { "type": "array", "items": { "ref": "pub.leaflet.richtext.facet", "type": "ref" } },
    "textSize": { "enum": ["default", "large", "small"], "type": "string" }
} } } }
```

**Facet** (`pub.leaflet.richtext.facet`) — same shape as Bluesky's, but with a much richer, **open** feature union for document typography:
```json
"features": { "type": "array", "items": { "type": "union", "refs": [
  "#atMention", "#bold", "#code", "#didMention", "#footnote", "#highlight",
  "#id", "#italic", "#link", "#strikethrough", "#underline"
] } }
```
- `#byteSlice` is identical to Bluesky's (UTF-8 byte offsets).
- `#didMention` carries a `did`; `#atMention` carries an `at-uri` — Leaflet distinguishes the two mention kinds Roomy conflates.
- `#bold`, `#italic`, `#strikethrough`, `#underline`, `#code` are typographic features Bluesky deliberately omitted for microblogging but a document app needs.
- `#highlight` carries a color; `#footnote` carries nested `contentPlaintext` + `contentFacets` (facets can themselves contain rich text — a recursive touch that is cleanly optional).
- `#link` is present and identical to Bluesky's, so a Bluesky client rendering a Leaflet doc still makes links clickable. This is the **cross-namespace compatibility** pattern: emit semantically-equivalent features from multiple lexicons in the same facet so consumers in any namespace can render it.

Leaflet's design validates the "blocks + facets" synthesis for structured long-form content on AT Protocol, and shows how to extend the feature set without breaking Bluesky interop. Notably, Paul Frazee (Bluesky team) renders his own Leaflet posts on his personal Next.js blog by reading `pub.leaflet.document` records directly from his PDS — confirming the format is independently consumable, not Leaflet-app-locked.

### 3.3 OXA: `pub.oxa.*` — scientific documents, facets-as-annotation

OXA (`oxa.dev`) defines `pub.oxa.document`, `pub.oxa.blocks.defs`, and `pub.oxa.richtext.facet` for scientific publishing on AT Protocol. The structure mirrors Leaflet's: a `Document` record contains an array of blocks; each block carries a `text` string and a `facets` array. The facet feature union is **declared `"closed": false`** for extensibility, and includes `emphasis`, `strong`, with planned `subscript`, `superscript`, `inline math`, and `cite`.

OXA's most important contribution to this research is the **"from trees to facets"** conversion rationale. OXA's authoring schema is a recursive inline tree (paragraph → strong → emphasis → text). The lexicon representation flattens that tree into a single `text` string with byte-range facets:

```
Recursive tree (authoring)         →    Flat text + facets (storage)
{type: Strong, children: [          →    text: "This is bold and italic text."
  {type: Text, value: "bold and "}, →    facets: [
  {type: Emphasis, children: [       →      {index:{8..23}, features:[#strong]},
    {type: Text, value: "italic"}    →      {index:{17..23}, features:[#emphasis]}
  ]}                                 →    ]
]}
```

The conversion walks the tree depth-first, concatenating text and recording byte offsets for each formatting node. This is the exact operation TipTap already performs in memory — `editor.getJSON()` is the tree, and a publish step would flatten it to text+facets.

OXA's second key idea, directly relevant to a chat app with quote-replies and future search: **facets as distributed annotations.** Because facets are byte-range annotations layered *on top of* immutable plain text, a third party can publish *additional* facets targeting someone else's document — e.g. an RRID annotation on a methods paragraph, living in the annotator's own repo, discoverable on the firehose, overlaid by any reader. For Roomy, the analog is quote-replies that point at a byte range in another user's message, or a future "highlight + comment" feature, implemented as separate records referencing a message's AT-URI + byte slice rather than mutating the original.

### 3.4 WhiteWind: `com.whtwnd.blog.entry` — the markdown-string counterexample

WhiteWind is the contrast case: it stores blog posts as a **plain markdown string** in a single `content` field:

```json
{ "id": "com.whtwnd.blog.entry", "defs": { "main": {
  "type": "record", "key": "tid",
  "record": { "type": "object", "required": ["content"], "properties": {
    "content": { "type": "string", "maxLength": 100000 },
    "title": { "type": "string", "maxLength": 1000 },
    "ogp": { "type": "ref", "ref": "com.whtwnd.blog.defs#ogp" },
    "blobs": { "type": "array", "items": { "type": "ref", "ref": "com.whtwnd.blog.defs#blobMetadata" } },
    "visibility": { "type": "string", "enum": ["public", "url", "author"] }
} } } } }
```

WhiteWind chose markdown because (a) it's a single-author blogging app with one renderer, so the multi-client "syntax barfing" problem Frazee describes doesn't bite, and (b) authoring ergonomics — users write markdown directly. This is the legitimate niche for the markdown-string model: **one writer, one reader-app, no third-party consumers.** Roomy is not in that niche: it has the app-lite client, the appserver, the Discord bridge (which author messages from a foreign format), and the explicit goal of being an open protocol where third parties can build readers. The fact that the most-structured ATProto publishing apps (Leaflet, OXA) abandoned markdown-in-a-string for blocks+facets is the signal.

### 3.5 The `standard.site` ecosystem note

`site.standard.*` (`standard.site`) defines shared lexicons for *discovery metadata* (what a publication is, how users subscribe) — it deliberately does *not* define content structure, leaving that to app-specific lexicons (Leaflet, OXA, WhiteWind each carry their own content model). This is the AT Protocol philosophy: nobody agrees on one monolithic schema; records can reference multiple lexicons; consumers ignore `$type`s they don't recognize. For Roomy this means a structured message body can adopt its own `space.roomy.richtext.*` namespace and still interop with mentions/links by emitting Bluesky-compatible facet features in the same facets (the OXA/Leaflet compatibility pattern).

---

## 4. Mapping the options to Roomy

### Option A — Status quo: markdown string in `Content`

Keep `body: { mimeType: "text/markdown", data: bytes }` and the sidecar `mentions` extension.

- **Pro:** Zero migration; TipTap authoring unchanged; bridges keep emitting markdown.
- **Con:** All the costs in §1 persist — re-parsing on render, lost intent under degradation, mentions structurally divorced from text, no byte-stable addressing. Roomy keeps paying the markdown tax forever.

### Option B — Tree JSON (ProseMirror/Lexical-style) in `Content`

Store `body: { mimeType: "application/x.roomy.doc+json", data: bytes }` where the decoded JSON is a ProseMirror/Lexical document tree.

- **Pro:** Editor-native — `editor.getJSON()`/`fromJSON` round-trips with zero conversion. Natural for block structure.
- **Con:** Schema-coupled; no graceful text fallback (unknown node = missing content, not plain text). A consumer that doesn't have the Roomy schema renders *nothing* or garbage. This is the worst property for an open protocol. AT Protocol precedent (Bluesky, Leaflet, OXA) uniformly rejects tree-only storage for exactly this reason. Also heavier on the wire for short chat messages.

### Option C — Facets over plain text (Bluesky-style), no blocks

Store `body: { text, facets }` directly — the Bluesky post shape, generalized.

- **Pro:** Graceful fallback to plain text; byte-stable addressing; matches the dominant AT Protocol precedent; mentions/links become facets instead of sidecars, unifying the model.
- **Con:** No block structure — chat messages are mostly inline anyway, but headings/lists/code blocks (which Roomy's TipTap already supports) can't be expressed. Forcing everything inline loses the block/inline distinction the editor already maintains.

### Option D — Blocks + facets (Leaflet/OXA-style) — **recommended**

Store the body as an array of typed blocks; inline content in each block is `plaintext`/`text` + `facets`. This is the synthesis every production AT Protocol structured-text app has converged on.

Sketch of a Roomy lexicon shape (NSID `space.roomy.richtext.*`, mirroring Leaflet's proven structure):

```jsonc
// space.roomy.message body (v1) — a linear document
{
  "$type": "space.roomy.richtext.document",
  "blocks": [
    { "$type": "space.roomy.richtext.blocks#text",
      "text": "Hey @alice.roomy.space check this https://roomy.space/did:plc:...",
      "facets": [
        { "index": {"byteStart":4,"byteEnd":21}, "features": [
          {"$type":"space.roomy.richtext.facet#didMention","did":"did:plc:alice"}
        ]},
        { "index": {"byteStart":33,"byteEnd":62}, "features": [
          {"$type":"space.roomy.richtext.facet#link","uri":"https://roomy.space/did:plc:..."},
          {"$type":"app.bsky.richtext.facet#link","uri":"https://roomy.space/did:plc:..."}  // cross-namespace compat
        ]}
      ] }
  ]
}
```

- **Inline formatting:** `#bold`, `#italic`, `#strikethrough`, `#code`, `#link`, `#didMention`, `#atMention`, `#highlight`, `#underline` — adopt Leaflet's set; it is battle-tested and open.
- **Cross-namespace compatibility:** emit `app.bsky.richtext.facet#link` alongside `space.roomy.richtext.facet#link` so Bluesky-ecosystem readers render links without knowing Roomy. This is the OXA/Leaflet pattern and it costs almost nothing.
- **Mentions become facets, not a sidecar.** The `space.roomy.extension.mentions.v0` sidecar collapses into `#didMention` facets — one source of truth, byte-addressed, renderable by any consumer that understands the feature. The notification-routing logic that currently consumes the sidecar can read the facets instead (it already needs to scan the body for other purposes).
- **Internal links become facets, not markdown syntax.** `[text](/did:plc:...)` becomes a `#link` facet (and optionally a Roomy-specific `#roomRef` feature carrying the `{spaceId, roomId}` to avoid re-parsing the URL). This eliminates `enrich-internal-links.ts`'s DOM walk and the `ROOMY_DOMAINS` sync between renderer and extractor — the structure is in the record.
- **Quote-replies / future annotation:** a quote reply is a record referencing `(messageAtUri, blockIndex, byteSlice)` — OXA's distributed-annotation pattern, no mutation of the original.
- **Authoring:** TipTap stays the editor. The publish step flattens `editor.getJSON()` → blocks+facets (the OXA tree→facets conversion, which is a straightforward depth-first walk). On edit, re-hydrate the tree from blocks+facets (ProseMirror can ingest a JSON doc; building one from text+facets is a small, well-understood mapping).
- **Bridges:** the Discord bridge currently emits markdown. It would emit blocks+facets instead — mention parsing is *easier* (DIDs go in facets, no markdown link syntax to get wrong), and the bridge is the consumer most harmed by markdown ambiguity today.

### Why D over B and C

- **vs B (tree):** D keeps the graceful-fallback property that makes AT Protocol records robust across clients. B does not. The block array in D is shallow and typed by `$type`, so unknown block types are dropped with their plain text preserved (emit `text` on every block), whereas unknown tree nodes in B lose content.
- **vs C (facets-only):** D preserves block structure (headings, lists, code, quotes) that the editor already produces and that chat increasingly needs (code blocks, quoted replies as blockquote blocks). C forces everything inline and loses that. For a chat product that may grow past one-paragraph messages, D is the lower-regret choice.

### Migration considerations

- **Backward compatibility:** keep `mimeType` on the body. Old messages stay `text/markdown`; new messages use `application/vnd.roomy.richtext+json` (or a CBOR map). Renderers branch on `mimeType`. The appserver can backfill-convert old markdown → blocks+facets lazily (one `text` block with `#link`/`#didMention` facets derived by the same `marked` parser already in use), or leave old messages as markdown and only use the new format going forward.
- **TipTap conversion:** a `proseMirrorDocToRoomyBlocks(doc)` and `roomyBlocksToProseMirrorDoc(blocks)` pair. The flatten direction is the OXA walk; the rehydrate direction is a small recursive builder. Both are <200 lines given the limited node set Roomy uses (paragraph, heading, blockquote, codeBlock, bulletList/orderedList, mention, link, bold, italic, code).
- **Discord bridge:** emits blocks+facets directly from Discord message structure — strictly simpler than emitting markdown then re-parsing it.
- **`extensions.mentions` deprecation:** once mentions are facets, the sidecar is redundant. Migrate readers (notification routing, appserver materialization) to scan facets; keep the sidecar for a transition window.

---

## 5. Recommendations

1. **Adopt Option D (blocks + facets)** under a `space.roomy.richtext.*` lexicon namespace. It is the only option that simultaneously (a) matches the dominant AT Protocol precedent, (b) preserves graceful text fallback for third-party clients, (c) unifies mentions/links/internal-refs into one structural model, and (d) supports the block structure Roomy's editor already produces.
2. **Define `space.roomy.richtext.facet`** with an open feature union mirroring Leaflet's (`#bold`, `#italic`, `#strikethrough`, `#code`, `#link`, `#didMention`, `#atMention`, `#highlight`, `#underline`), plus Roomy-specific `#roomRef` carrying `{spaceId, roomId?}` for internal links.
3. **Emit cross-namespace-compatible facets:** include `app.bsky.richtext.facet#link` (and `#mention` where a DID is involved) alongside Roomy features so Bluesky-ecosystem tools render links/mentions without understanding Roomy.
4. **Fold mentions into facets** and deprecate `space.roomy.extension.mentions.v0` after a transition window; update notification routing and appserver materialization to read `#didMention` from facets.
5. **Keep `Content { mimeType, data }`** as the envelope so old markdown messages and new structured messages coexist; branch rendering on `mimeType`. Convert old messages lazily or leave them as-is.
6. **Author a `space.roomy.richtext.document` lexicon** modeled on Leaflet's `pub.leaflet.pages.linearDocument` (array of typed blocks, each text-bearing block has `text` + `facets`), registered in `packages/appserver/lexicons/` and generated into the SDK alongside existing event schemas.

---

## Sources

- **Roomy codebase** (first-hand): `packages/sdk/src/schema/primitives.ts` (`Content`), `packages/sdk/src/schema/events/message.ts` (`CreateMessageSchema`), `packages/sdk/src/schema/extensions/message.ts` (`Mentions`), `packages/app-lite/src/lib/mutations/message.ts`, `packages/app-lite/src/lib/components/chat/ChatInput.svelte`, `packages/design/src/utils/markdown.ts`, `packages/app-lite/src/lib/components/chat/embeds/enrich-internal-links.ts`, `packages/app-lite/src/lib/components/chat/embeds/prefetch-link-summaries.ts`.
- **Bluesky facet lexicon** (raw): `bluesky-social/atproto` `lexicons/app/bsky/richtext/facet.json` — `https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/richtext/facet.json`
- **Bluesky post lexicon** (raw): `bluesky-social/atproto` `lexicons/app/bsky/feed/post.json` — `https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/feed/post.json`
- **Paul Frazee, "Why RichText facets in Bluesky"** (2024-01-15) — `https://www.pfrazee.com/blog/why-facets` (the three-problem rationale: syntax barfing, parsing sucks, character counting).
- **Leaflet lexicons** (raw, `mary-ext/atcute` `trunk`): `pub.leaflet.document`, `pub.leaflet.pages.linearDocument`, `pub.leaflet.blocks.text`, `pub.leaflet.blocks.header`, `pub.leaflet.blocks.blockquote`, `pub.leaflet.blocks.orderedList`, `pub.leaflet.blocks.code`, `pub.leaflet.richtext.facet` — `https://github.com/mary-ext/atcute/tree/trunk/packages/definitions/leaflet/lexicons/pub/leaflet`
- **Paul Frazee, "My leaflets now show on my personal blog"** (2026-01-05) — `https://www.pfrazee.com/leaflets/3mbnbdt4bas2a` (demonstrates independent consumption of `pub.leaflet.document` records + the blocks/facets renderer structure).
- **OXA, "Scientific Documents as First-Class Objects on AT Protocol"** (2026-03-25) — `https://www.oxa.dev/articles/oxa-on-at-proto` (tree→facets conversion, open `"closed": false` feature union, cross-namespace compatibility, distributed annotation).
- **WhiteWind lexicons** (raw, `whtwnd/whitewind-blog` `main`): `com.whtwnd.blog.entry`, `com.whtwnd.blog.defs` — `https://github.com/whtwnd/whitewind-blog/tree/main/lexicons/com/whtwnd/blog` (the markdown-string counterexample).
- **ProseMirror reference** — `https://prosemirror.net/docs/ref/` (`Node`/`Schema`/`Mark`, `toJSON`/`fromJSON`).
- **Lexical serialization docs** — `https://lexical.dev/docs/serialization/` (EditorState JSON, node tree + text `__format`/marks).
- **Quill Delta** — `https://quilljs.com/docs/delta/` (flat ops with inline attributes).
- **Editor landscape overviews** (2025–2026): Liveblocks "Which rich text editor framework should you choose in 2025"; pkgPulse "Tiptap vs Quill vs Lexical vs Slate: 2026"; Nutrient "Headless vs WYSIWYG editors 2025".