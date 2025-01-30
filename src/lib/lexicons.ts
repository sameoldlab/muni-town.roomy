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
    id: "town.muni.roomy.v0.store",
    defs: {
      main: {
        type: "record",
        record: {
          type: "object",
          properties: {
            key: {
              type: "array",
              items: {
                type: "string",
              },
            },
            data: {
              type: "blob",
            },
          },
        },
      },
    },
  },
];
