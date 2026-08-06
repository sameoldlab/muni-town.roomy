import type { Agent } from "@atproto/api";

export interface ProfileOptions {
  displayName?: string;
  description?: string;
  pronouns?: string;
  website?: string;
}

/**
 * Set (or update) the caller's Roomy profile by writing the
 * `space.roomy.user.profile/self` record on their PDS.
 */
export async function setProfile(
  agent: Agent,
  opts: ProfileOptions,
): Promise<void> {
  const record: Record<string, unknown> = {
    $type: "space.roomy.user.profile",
  };
  if (opts.displayName) record.displayName = opts.displayName;
  if (opts.description) record.description = opts.description;
  if (opts.pronouns) record.pronouns = opts.pronouns;
  if (opts.website) record.website = opts.website;

  await agent.com.atproto.repo.putRecord({
    collection: "space.roomy.user.profile",
    repo: agent.assertDid,
    rkey: "self",
    record,
  });
}
