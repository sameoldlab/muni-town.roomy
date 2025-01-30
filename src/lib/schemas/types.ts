/** The user's index of all of the chats that they have joined. */
export type Index = {
  /** Direct messages to other users. */
  dms: {
    [
      /** The DID of the user that the DM is with. */
      did: string
    ]: {
      /** The name associated to the direct message, usually the handle of the user. */
      name: string;
    };
  };
};
