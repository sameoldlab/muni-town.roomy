import { transport } from "@roomy-space/sdk";
type DirectXrpcClient = InstanceType<typeof transport.DirectXrpcClient>;

export interface RoomInfo {
  id: string;
  name?: string;
  kind: string;
  defaultAccess: string;
  canRead: boolean;
  canWrite: boolean;
  unreadCount: number;
}

export interface SidebarCategory {
  name: string;
  channels: RoomInfo[];
}

/**
 * List all rooms (channels) in a space via getMetadata.
 */
export async function listRooms(
  xrpc: DirectXrpcClient,
  spaceId: string,
): Promise<{ categories: SidebarCategory[]; orphans: RoomInfo[] }> {
  const meta = await xrpc.query("space.roomy.space.getMetadata", { spaceId });
  return {
    categories: meta.sidebar.categories.map((cat) => ({
      name: cat.name,
      channels: cat.channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        kind: "channel",
        defaultAccess: ch.defaultAccess,
        canRead: ch.canRead,
        canWrite: ch.canWrite,
        unreadCount: ch.unreadCount,
      })),
    })),
    orphans: meta.sidebar.orphans.map((ch) => ({
      id: ch.id,
      name: ch.name,
      kind: "channel",
      defaultAccess: ch.defaultAccess,
      canRead: ch.canRead,
      canWrite: ch.canWrite,
      unreadCount: ch.unreadCount,
    })),
  };
}
