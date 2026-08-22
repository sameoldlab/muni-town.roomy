/**
 * One-time migration script: migrates all space DIDs to the Roomy PDS.
 *
 * Self-contained — no appserver runtime modules are imported. For each space
 * DID it:
 *   1. reserveSigningKey on the PDS
 *   2. PLC update: repoint #atproto_pds at the PDS, transfer rotation
 *      authority to the PDS key
 *   3. createAccount on the PDS
 *   4. write space.roomy.service/self to the space's repo
 *   5. record the password
 *
 * Migration state (passwords, reserved keys, anomalies) is persisted to local
 * files / CSV — nothing reads these values after the migration flow completes.
 * The passwords CSV is what gets imported into the arbiter server afterward.
 *
 * Usage: bun run scripts/migrate-spaces-to-pds.ts [--dry-run] [--csv <path>]
 *
 * Environment variables:
 *   EVENTS_DB_PATH       — path to appserver events DB (default: data/roomy-events.sqlite)
 *   ROOMY_PDS_URL        — Roomy PDS endpoint (required)
 *   ROOMY_PDS_INVITE_CODE — invite code for account creation (required)
 *   ROOMY_PDS_HANDLE_SUFFIX — handle suffix (default: .roomy.space)
 *   ROOMY_SERVICE_DID    — the Roomy appserver DID to write into space.roomy.service
 *                          (default: did:web:api.roomy.space)
 *   PLC_DIRECTORY_URL    — PLC directory (default: https://plc.directory)
 */

import { Database } from "bun:sqlite";
import { writeFileSync, existsSync, appendFileSync, readFileSync } from "node:fs";
import { AtpAgent, XRPCError } from "@atproto/api";
import { Secp256k1Keypair } from "@atproto/crypto";
import { createUpdateOp, type CompatibleOp } from "@did-plc/lib";

// ─── Config ─────────────────────────────────────────────────────────────

interface MigrationOptions {
  dryRun: boolean;
  csvPath: string;
  reservedKeysPath: string;
  anomaliesPath: string;
  pdsUrl: string;
  inviteCode: string;
  handleSuffix: string;
  serviceDid: string;
}

function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const csvFlag = args.indexOf("--csv");
  const csvPath = csvFlag >= 0 ? args[csvFlag + 1] : "migrated-spaces.csv";

  const pdsUrl = process.env.ROOMY_PDS_URL;
  const inviteCode = process.env.ROOMY_PDS_INVITE_CODE;
  if (!pdsUrl) {
    console.error("ROOMY_PDS_URL is required");
    process.exit(1);
  }
  if (!inviteCode) {
    console.error("ROOMY_PDS_INVITE_CODE is required");
    process.exit(1);
  }

  return {
    dryRun,
    csvPath,
    reservedKeysPath: "migrated-reserved-keys.csv",
    anomaliesPath: "migration-anomalies.log",
    pdsUrl,
    inviteCode,
    handleSuffix: process.env.ROOMY_PDS_HANDLE_SUFFIX ?? ".roomy.space",
    serviceDid: process.env.ROOMY_SERVICE_DID ?? "did:web:api.roomy.space",
  };
}

// ─── PDS client ─────────────────────────────────────────────────────────

/**
 * Thin wrapper around AtpAgent for per-space account management. Creates PDS
 * accounts for space DIDs using an invite code (no admin credentials needed),
 * and authenticates as a space account to write records into its own repo.
 */
class PdsClient {
  readonly pdsUrl: string;
  readonly handleSuffix: string;
  #inviteCode: string;

  constructor(config: { pdsUrl: string; inviteCode: string; handleSuffix: string }) {
    this.pdsUrl = config.pdsUrl;
    this.handleSuffix = config.handleSuffix;
    this.#inviteCode = config.inviteCode;
  }

  /** Reserve a signing key for a DID on the PDS. Returns a did:key string. */
  async reserveSigningKey(did: string): Promise<string> {
    const agent = new AtpAgent({ service: this.pdsUrl });
    const res = await agent.com.atproto.server.reserveSigningKey({ did });
    const signingKey = res.data.signingKey;
    if (!signingKey || !signingKey.startsWith("did:key:")) {
      throw new Error(
        `PDS returned an unexpected signing key format for ${did}: ${JSON.stringify(signingKey)}`,
      );
    }
    return signingKey;
  }

  /** Create a PDS account for an existing DID. */
  async createAccount(opts: { did: string; handle: string; password: string }): Promise<void> {
    const agent = new AtpAgent({ service: this.pdsUrl });
    await agent.com.atproto.server.createAccount({
      did: opts.did,
      handle: opts.handle,
      password: opts.password,
      inviteCode: this.#inviteCode,
    });
  }

  /** Authenticate as a space account and write a record into its own repo. */
  async putRecord(
    did: string,
    password: string,
    collection: string,
    record: Record<string, unknown>,
    rkey = "self",
  ): Promise<void> {
    const agent = new AtpAgent({ service: this.pdsUrl });
    await agent.login({ identifier: did, password });
    const resp = await agent.com.atproto.repo.putRecord(
      { repo: did, collection, rkey, record },
      { headers: { "atproto-proxy": `${did}#atproto_pds` } },
    );
    if (!resp.success) {
      throw new Error(`putRecord ${collection}/${rkey} failed for ${did}`);
    }
  }
}

// ─── PLC update ──────────────────────────────────────────────────────────

const PLC_DIRECTORY = () => process.env.PLC_DIRECTORY_URL ?? "https://plc.directory";

/**
 * Update a space DID's PLC document to point `#atproto_pds` at the Roomy PDS,
 * set `#atproto` verification method to the PDS signing key, and transfer full
 * rotation authority to the PDS (drop the appserver key). Signed with the
 * appserver's stored per-space key.
 */
async function updateSpacePdsEndpoint(
  spaceDid: string,
  pdsUrl: string,
  pdsSigningKey: string,
  appserverKey: Secp256k1Keypair,
): Promise<void> {
  const lastOpRes = await fetch(`${PLC_DIRECTORY()}/${encodeURIComponent(spaceDid)}/log/last`);
  if (!lastOpRes.ok) {
    throw new Error(`PLC getLastOp failed (${lastOpRes.status}): ${await lastOpRes.text()}`);
  }
  const lastOp = await lastOpRes.json() as unknown;
  const compatibleOp = lastOp as CompatibleOp;

  const op = await createUpdateOp(
    compatibleOp,
    appserverKey,
    (normalized) => ({
      ...normalized,
      verificationMethods: { ...normalized.verificationMethods, atproto: pdsSigningKey },
      services: {
        ...normalized.services,
        atproto_pds: { type: "AtprotoPersonalDataServer", endpoint: pdsUrl },
      },
      rotationKeys: [pdsSigningKey],
    }),
  );

  const submitRes = await fetch(`${PLC_DIRECTORY()}/${encodeURIComponent(spaceDid)}`, {
    method: "POST",
    body: JSON.stringify(op),
    headers: { "Content-Type": "application/json" },
  });
  if (!submitRes.ok) {
    throw new Error(`PLC update failed (${submitRes.status}): ${await submitRes.text()}`);
  }
}

// ─── Migration helpers ──────────────────────────────────────────────────

/** The Roomy service record collection + rkey written to each space repo. */
const SERVICE_COLLECTION = "space.roomy.service";
const SERVICE_RKEY = "self";

/** Generate a handle for a space DID (first 20 chars of the DID body + suffix). */
function generateHandle(did: string, suffix: string): string {
  const body = did.startsWith("did:plc:") ? did.slice(8) : did;
  return `${body.slice(0, 20)}${suffix}`;
}

/** Generate a random 32-byte hex-encoded password. */
function generatePassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

/**
 * Whether the space DID's PLC doc already points `#atproto_pds` at the given
 * PDS URL and holds the PDS key as `#atproto`. Used for idempotency: skip the
 * PLC update rather than appending a duplicate operation.
 */
async function isPdsEndpointCurrent(
  spaceDid: string,
  pdsUrl: string,
  pdsSigningKey: string,
): Promise<boolean> {
  const res = await fetch(`${PLC_DIRECTORY()}/${encodeURIComponent(spaceDid)}`);
  if (!res.ok) return false;
  const doc = await res.json() as {
    service?: Array<{ id?: string; serviceEndpoint?: string }>;
    verificationMethod?: Array<{ id?: string; publicKeyMultibase?: string }>;
  };
  const pds = (doc.service ?? []).find(
    (s) => (s.id ?? "").replace(/^#/, "") === "atproto_pds",
  );
  if (!pds || pds.serviceEndpoint !== pdsUrl) return false;
  const atproto = (doc.verificationMethod ?? []).find(
    (v) => (v.id ?? "").replace(/^#/, "") === "atproto",
  );
  const multibase = pdsSigningKey.replace(/^did:key:/, "");
  return atproto?.publicKeyMultibase === multibase;
}

/** Classify an error as transient (retryable) or permanent. */
function isTransientError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // network error
  if (!(err instanceof Error)) return false;
  // XRPCError carries the HTTP status as a numeric enum (e.g. 500, 429);
  // its `message` is the PDS's human-readable text, not a status code.
  if (err instanceof XRPCError) {
    const status = err.status as number;
    return status >= 500 || status === 429;
  }
  return false;
}

/**
 * Set up a PDS account for a single space DID. Returns the generated password
 * (for CSV export) or null if the space was already migrated.
 */
async function migrateSpace(
  eventsDb: Database,
  state: MigrationState,
  pds: PdsClient,
  did: string,
  serviceDid: string,
): Promise<string | null> {
  if (await state.isMigrated(did)) return null;

  // Read the per-space signing key from the events DB.
  const keyRow = eventsDb
    .query("select k256_key from did_keys where did = ?")
    .get<{ k256_key: Uint8Array | null }>(did);
  if (!keyRow?.k256_key) {
    await state.logAnomaly(did, "setup", "missing_key", "No signing key found for space DID");
    throw new Error(`No signing key found for space DID: ${did}`);
  }
  const appserverKey = await Secp256k1Keypair.import(keyRow.k256_key, { exportable: true });

  // Reserve a signing key on the PDS — reuse a previously reserved one if
  // present so PLC updates stay idempotent across retries.
  let pdsSigningKey = await state.getReservedKey(did);
  if (!pdsSigningKey) {
    pdsSigningKey = await pds.reserveSigningKey(did);
    await state.setReservedKey(did, pdsSigningKey);
  }

  // Update the PLC doc to point at the PDS (before createAccount so the PDS
  // sees a consistent doc). Idempotent: skip if already in the target state.
  if (!(await isPdsEndpointCurrent(did, pds.pdsUrl, pdsSigningKey))) {
    await updateSpacePdsEndpoint(did, pds.pdsUrl, pdsSigningKey, appserverKey);
  }

  const handle = generateHandle(did, pds.handleSuffix);
  const password = generatePassword();
  await pds.createAccount({ did, handle, password });

  // Write the service record to the space's own repo, marking it as a Roomy
  // space and naming the Roomy server that hosts it.
  await pds.putRecord(did, password, SERVICE_COLLECTION, {
    $type: SERVICE_COLLECTION,
    did: serviceDid,
  }, SERVICE_RKEY);

  await state.recordMigrated(did, password);
  return password;
}

/** Migrate a space DID with retry for transient failures (1s, 2s, 4s, 8s max). */
async function migrateWithRetry(
  eventsDb: Database,
  state: MigrationState,
  pds: PdsClient,
  did: string,
  serviceDid: string,
): Promise<string | null> {
  const maxDelay = 8000;
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await migrateSpace(eventsDb, state, pds, did, serviceDid);
    } catch (err) {
      const transient = isTransientError(err);
      if (!transient || attempt >= 4) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  [RETRY ${attempt}/3] ${did}: ${msg} (waiting ${delay}ms)`);
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, delay);
      await promise;
      delay = Math.min(delay * 2, maxDelay);
    }
  }
}

// ─── File-backed migration state ────────────────────────────────────────

interface MigrationState {
  isMigrated(did: string): Promise<boolean>;
  recordMigrated(did: string, password: string): Promise<void>;
  getReservedKey(did: string): Promise<string | null>;
  setReservedKey(did: string, signingKey: string): Promise<void>;
  logAnomaly(did: string, stage: string, code: string, message: string): Promise<void>;
}

/** File/CSV-backed migration state. Nothing reads these after the flow completes. */
function makeFileState(opts: MigrationOptions): MigrationState {
  const migrated = new Set<string>();
  if (existsSync(opts.csvPath)) {
    for (const line of readFileSync(opts.csvPath, "utf-8").split("\n").slice(1)) {
      const did = line.split(",")[0];
      if (did) migrated.add(did);
    }
  }

  const reserved = new Map<string, string>();
  if (existsSync(opts.reservedKeysPath)) {
    for (const line of readFileSync(opts.reservedKeysPath, "utf-8").split("\n").slice(1)) {
      const [did, key] = line.split(",");
      if (did && key) reserved.set(did, key);
    }
  }

  return {
    async isMigrated(did) {
      return migrated.has(did);
    },
    async recordMigrated(did, password) {
      migrated.add(did);
      if (!existsSync(opts.csvPath)) writeFileSync(opts.csvPath, "did,password\n");
      appendFileSync(opts.csvPath, `${did},${password}\n`);
    },
    async getReservedKey(did) {
      return reserved.get(did) ?? null;
    },
    async setReservedKey(did, signingKey) {
      reserved.set(did, signingKey);
      if (!existsSync(opts.reservedKeysPath)) writeFileSync(opts.reservedKeysPath, "did,signing_key\n");
      appendFileSync(opts.reservedKeysPath, `${did},${signingKey}\n`);
    },
    async logAnomaly(did, stage, code, message) {
      appendFileSync(opts.anomaliesPath, `${new Date().toISOString()}\t${did}\t${stage}\t${code}\t${message}\n`);
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const eventsDbPath = process.env.EVENTS_DB_PATH ?? "data/roomy-events.sqlite";
  const eventsDb = new Database(eventsDbPath);

  // All DIDs in the events DB are spaces (the appserver only creates DIDs for
  // spaces; the Leaf migration did not import personal streams).
  const dids = eventsDb.query("select did from dids order by did").all() as { did: string }[];

  console.log(`Found ${dids.length} space DIDs to migrate`);
  if (opts.dryRun) console.log("DRY-RUN — no changes will be made");

  const pds = new PdsClient({
    pdsUrl: opts.pdsUrl,
    inviteCode: opts.inviteCode,
    handleSuffix: opts.handleSuffix,
  });
  const state = makeFileState(opts);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches of 10 with a 1s pause between batches to respect PDS
  // rate limits.
  const BATCH_SIZE = 10;
  for (let i = 0; i < dids.length; i += BATCH_SIZE) {
    const batch = dids.slice(i, i + BATCH_SIZE);
    for (const { did } of batch) {
      if (opts.dryRun) {
        console.log(`[DRY-RUN] would migrate ${did}`);
        continue;
      }
      try {
        const password = await migrateWithRetry(eventsDb, state, pds, did, opts.serviceDid);
        if (password === null) {
          skipped++;
          console.log(`[SKIP] ${did} (already migrated)`);
        } else {
          migrated++;
          console.log(`[MIGRATED] ${did}`);
        }
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        const code = isTransientError(err) ? "upstream_error" : "permanent_error";
        await state.logAnomaly(did, "setup", code, message);
        console.error(`[FAILED] ${did}: ${message}`);
      }
    }
    if (i + BATCH_SIZE < dids.length) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 1000);
      await promise;
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
  console.log(`Passwords written to ${opts.csvPath}`);
  if (failed > 0) console.log(`Check ${opts.anomaliesPath} for ${failed} failed DIDs`);

  eventsDb.close();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
