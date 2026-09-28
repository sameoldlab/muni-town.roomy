import {
  createCosmikCard,
  type CreatedCard,
  type schemas,
} from "@roomy-space/sdk";
import { createArbiterClient } from "$lib/arbiter";

type LinkEmbedData = typeof schemas.queries.getMessage.LinkEmbedData.infer;

/**
 * Create a Semble space card (`network.cosmik.card`) on the space's own
 * ATProto account from a chat-message link.
 *
 * Goes directly to the space's arbiter through the
 * `space.roomy.authComplete.arbiter.proxy` procedure — the same admin-authority
 * path as the Bluesky profile integration (see `createArbiterClient`). The
 * published `space.roomy.authComplete` scope policy admits the proxied
 * `createRecord` for `network.cosmik.*` collections, and the space's policy
 * pipeline grants its Roomy admins.
 *
 * Only the link and its enriched metadata are recorded — the message text is
 * never copied into the card.
 */
export async function createSpaceCard(
  spaceId: string,
  link: { url: string; embed?: LinkEmbedData | null },
): Promise<CreatedCard> {
  const embed = link.embed;
  // Same image preference the LinkCard renderer uses: first embed image, else
  // the thumbnail.
  const imageUrl =
    embed?.imgs && embed.imgs.length > 0 ? embed.imgs[0]?.u : embed?.thumb?.u;
  const metadata = embed
    ? {
        title: embed.t,
        description: embed.d,
        author: embed.au?.n,
        siteName: embed.p?.n,
        imageUrl,
        retrievedAt: new Date().toISOString(),
      }
    : null;
  const arbiter = createArbiterClient();
  return createCosmikCard(arbiter, spaceId, { url: link.url, metadata });
}