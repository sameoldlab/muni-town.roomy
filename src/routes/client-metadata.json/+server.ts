import { json } from "@sveltejs/kit";
import { clientMetadata } from "$lib/atproto";

export async function GET() {
  return json(clientMetadata);
}
