/**
 * Unit tests for `createCosmikCard` — the Semble space-card write helper.
 *
 * Stubs `ArbiterClient#proxy` and asserts the proxied `createRecord`
 * operation's shape against the published `network.cosmik.card` lexicon:
 * a URL card carries the link and its optional metadata — nothing else
 * (no note text, no chat-message content).
 */
import { describe, it, expect } from "vitest";
import { ArbiterProxyError } from "../transport/errors";
import { COSMIK_CARD_COLLECTION, createCosmikCard } from "./cosmik-card";
import type { ArbiterClient, ProxyOperation } from "./arbiter";

const SPACE_DID = "did:plc:space123";

/** The proxied `createRecord` body shape `createCosmikCard` must produce. */
interface CreateRecordBody {
  repo: string;
  collection: string;
  record: {
    $type: string;
    type: string;
    createdAt: string;
    content: {
      $type: string;
      url: string;
      metadata?: Record<string, unknown>;
    };
  };
}

/**
 * Stub `ArbiterClient` recording `proxy` calls. Structural stand-in for the
 * real client: `createCosmikCard` only calls `#proxy`, and the stub's method
 * signature mirrors `ArbiterClient#proxy`, so a signature change fails here.
 */
function stubProxy(
  respond: (op: ProxyOperation) => Promise<Record<string, unknown>>,
): ProxyStub {
  const calls: RecordedProxyCall[] = [];
  const arbiter = {
    proxy: async (spaceDid: string, op: ProxyOperation) => {
      calls.push({ spaceDid, op });
      return respond(op);
    },
  } as ArbiterClient;
  return { arbiter, calls };
}

/** One recorded `ArbiterClient#proxy` call. */
interface RecordedProxyCall {
  spaceDid: string;
  op: ProxyOperation;
}

/** Stub `ArbiterClient` recording `proxy` calls. */
interface ProxyStub {
  arbiter: ArbiterClient;
  calls: RecordedProxyCall[];
}

/** Pull the createRecord body out of the single recorded proxy call. */
function onlyProxyBody(stub: ProxyStub): CreateRecordBody {
  expect(stub.calls).toHaveLength(1);
  // Test-constructed value of the stub's known shape — not external input.
  const { spaceDid, op } = stub.calls[0]!;
  expect(spaceDid).toBe(SPACE_DID);
  expect(op.nsid).toBe("com.atproto.repo.createRecord");
  expect(op.method).toBe("POST");
  expect(op.body).toBeDefined();
  const body = op.body as CreateRecordBody;
  expect(body.collection).toBe(COSMIK_CARD_COLLECTION);
  expect(body.repo).toBe(SPACE_DID);
  return body;
}

describe("createCosmikCard", () => {
  it("proxies a createRecord of network.cosmik.card with a URL card", async () => {
    const { arbiter, calls } = stubProxy(() =>
      Promise.resolve({ uri: `at://${SPACE_DID}/${COSMIK_CARD_COLLECTION}/3k`, cid: "bafy" }),
    );

    const created = await createCosmikCard(arbiter, SPACE_DID, {
      url: "https://example.com/article",
    });

    expect(calls).toHaveLength(1);
    const body = onlyProxyBody({ arbiter, calls });
    expect(body.record).toEqual({
      $type: COSMIK_CARD_COLLECTION,
      type: "URL",
      content: {
        $type: `${COSMIK_CARD_COLLECTION}#urlContent`,
        url: "https://example.com/article",
      },
      createdAt: expect.any(String),
    });
    expect(created).toEqual({
      uri: `at://${SPACE_DID}/${COSMIK_CARD_COLLECTION}/3k`,
      cid: "bafy",
    });
  });

  it("maps metadata onto #urlMetadata and omits unset fields", async () => {
    const { arbiter, calls } = stubProxy(() =>
      Promise.resolve({ uri: "at://x/y/z", cid: "bafy" }),
    );

    await createCosmikCard(arbiter, SPACE_DID, {
      url: "https://example.com",
      metadata: {
        title: "Example",
        author: "Jane Doe",
        siteName: "Example Site",
        description: undefined,
        imageUrl: undefined,
      },
    });

    const body = onlyProxyBody({ arbiter, calls });
    expect(body.record.content.metadata).toEqual({
      $type: `${COSMIK_CARD_COLLECTION}#urlMetadata`,
      title: "Example",
      author: "Jane Doe",
      siteName: "Example Site",
    });
  });

  it("omits metadata entirely when there is none", async () => {
    const { arbiter, calls } = stubProxy(() =>
      Promise.resolve({ uri: "at://x/y/z", cid: "bafy" }),
    );

    await createCosmikCard(arbiter, SPACE_DID, {
      url: "https://example.com/plain",
      metadata: null,
    });

    const body = onlyProxyBody({ arbiter, calls });
    expect(body.record.content).toEqual({
      $type: `${COSMIK_CARD_COLLECTION}#urlContent`,
      url: "https://example.com/plain",
    });
    expect("metadata" in body.record.content).toBe(false);
  });

  it("rejects a proxy failure and a success body without uri/cid", async () => {
    // A proxy failure (e.g. scope-policy denial) surfaces as ArbiterProxyError.
    const denied = stubProxy(() =>
      Promise.reject(new ArbiterProxyError(403, "denied", "Forbidden")),
    );
    await expect(
      createCosmikCard(denied.arbiter, SPACE_DID, { url: "https://e.com" }),
    ).rejects.toBeInstanceOf(ArbiterProxyError);

    // A 200 body without uri/cid is an error, not a silent success.
    const malformed = stubProxy(() => Promise.resolve({}));
    await expect(
      createCosmikCard(malformed.arbiter, SPACE_DID, { url: "https://e.com" }),
    ).rejects.toThrow(/missing uri\/cid/);
  });
});