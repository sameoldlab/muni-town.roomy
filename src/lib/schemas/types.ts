/** The user's index of all of the chats that they have joined. */
export type Catalog = {
  /** Direct messages to other users. */
  dms: {
    [
      /** The DID of the user that the DM is with. */
      did: string
    ]: {
      /** The name associated to the direct message, usually the handle of the user. */
      name: string;

      /** The avatar URL string, optional */
      avatar?: string;
    };
  };
};

export type Channel = {
  messages: ChatEvent[];
  threads: {
    title: string;
    /** Last updated. Currently timestamping on creation. 
      * TODO: implement update existing threads
    */
    updated_at: number;
    messages: ChatEvent[];
  }
};

// WIP Message type for Chats
// TODO: finalize with lexicon
export interface ChatEvent {
  /** The body of the chat message as CommonMark markdown. */
  content: string;
  /** The JS timestamp that the chat was sent at. */
  timestamp: number;
  user: {
    /** The DID of the author of the chat message. */
    did: string;
    /** The handle of the author of the chat message when they sent it. */
    handle: string;
    /** The avatar URL string */
    avatar: string;
  };
}