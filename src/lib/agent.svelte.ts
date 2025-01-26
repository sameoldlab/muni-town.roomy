import { Agent } from "@atproto/api";
import type { OAuthSession } from "@atproto/oauth-client-browser";

export function createAgentStore() {
  let agent: Agent | undefined = $state();

  function initAgent(session: OAuthSession) {
    agent = new Agent(session);
  }

  return {
    get agent() {
      return agent;
    },
    initAgent,
  };
}

export const agentStore = createAgentStore();
