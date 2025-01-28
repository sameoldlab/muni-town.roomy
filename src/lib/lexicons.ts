import { type LexiconDoc } from "@atproto/lexicon";

export const lexicons: LexiconDoc[] = [
  {
    lexicon: 1,
    id: "town.muni.roomy.v0.key",
    description: "Get your keypair from the keyserver.",
    defs: {
      main: {
        type: "query",
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              publicKey: {
                type: "string",
              },
              privateKey: {
                type: "string",
              },
            },
          },
        },
      },
    },
  },

  {
    lexicon: 1,
    id: "town.muni.roomy.v0.key.public",
    description: "Get the public for the given user from the keyserver.",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          properties: {
            did: {
              type: "string",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              publicKey: { type: "string" },
            },
          },
        },
      },
    },
  },

  {
    lexicon: 1,
    id: "town.muni.roomy.v0.index",
    description:
      "The id and data for the automerge document containing the user's \"index\". i.e. all of the chat rooms / direct messages they've joined.",
    defs: {
      main: {
        type: "record",
        record: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The automerge URL of the user's index.",
            },
            data: {
              type: "blob",
              description:
                "The latest known export of the automerge document for the user's index.",
            },
          },
        },
      },
    },
  },
];
