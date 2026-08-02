/**
 * Schema for `space.roomy.space.joinSpace` (procedure).
 * Source of truth: packages/appserver/docs/plans/procedure-backlog.md
 *
 * Validates invite tokens for private spaces, appends the space-side join
 * event, and writes the joinedSpace edge directly.
 */
import { type } from "arktype";

export const NSID = "space.roomy.space.joinSpace" as const;

export const Input = type({
  spaceId: "string",
  "inviteToken?": "string",
});

export const Output = type({
  spaceId: "string",
});
