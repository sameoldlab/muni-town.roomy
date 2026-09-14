/**
 * Read-state schema version — re-exported from the version manifest.
 *
 * The read-state DB lifecycle is owned by the SQLite worker (see worker.ts).
 * The version and migration list live in `./readStateVersions.ts`, which is the
 * single source of truth imported by both the worker thread and the main
 * thread; this module exists only to keep the historic import path stable for
 * callers in db.ts and the tests.
 */
export { READSTATE_SCHEMA_VERSION } from "./readStateVersions.ts";
