import { type LexiconDoc } from "@atproto/lexicon";

export const lexicons: LexiconDoc[] = [
  {
    lexicon: 1,
    id: "town.muni.roomy.v0.key",
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
];
