import { newUlid, toBytes, transport } from "@roomy-space/sdk";
type DirectXrpcClient = InstanceType<typeof transport.DirectXrpcClient>;

export interface MessageInfo {
  id: string;
  authorDid: string;
  authorName: string;
  content: string;
  timestamp: string;
}

/**
 * Send a message to a room via sendEvents.
 */
export async function sendMessage(
  xrpc: DirectXrpcClient,
  spaceId: string,
  roomId: string,
  text: string,
): Promise<{ messageId: string }> {
  const messageId = newUlid();
  const event = {
    id: messageId,
    room: roomId,
    $type: "space.roomy.message.createMessage.v0" as const,
    body: {
      mimeType: "text/markdown",
      data: toBytes(new TextEncoder().encode(text)),
    },
    extensions: {},
  };

  await xrpc.procedure("space.roomy.space.sendEvents", {
    spaceId,
    events: [event],
  });

  return { messageId };
}

/**
 * Read messages from a room.
 */
export async function readMessages(
  xrpc: DirectXrpcClient,
  roomId: string,
  limit: number = 20,
): Promise<MessageInfo[]> {
  const result = await xrpc.query("space.roomy.room.getMessages", {
    roomId,
    ...(limit !== 20 ? { limit: String(limit) } : {}),
  });

  return result.messages.map((m) => ({
    id: m.id,
    authorDid: m.authorDid,
    authorName: m.authorName,
    content: m.content,
    timestamp: m.timestamp,
  }));
}
