/**
 * Appserver data-directory path resolution.
 *
 * All SQLite DBs and the per-stream DID signing keys live under a single data
 * directory, configured via `DATA_DIR` (default `data`). No per-file env
 * overrides — `DATA_DIR` is the only knob.
 *
 * Layout:
 *   DATA_DIR/
 *   ├── roomy-events.sqlite       (event log; also holds per-stream DID signing keys)
 *   ├── roomy-readstate.sqlite    (read state)
 *   ├── global.sqlite             (global DB)
 *   └── spaces/                   (per-space DBs)
 */

import { join } from "node:path";

/** Resolve the appserver data directory. Defaults to `DATA_DIR` or `data`. */
export function dataDir(): string {
  return process.env.DATA_DIR ?? "data";
}

/** Resolve a DB file path under the data dir. `DATA_DIR=:memory:` ⇒ `:memory:`. */
export function dbPath(filename: string): string {
  const dir = dataDir();
  return dir === ":memory:" ? ":memory:" : join(dir, filename);
}

/** Resolve the per-space DBs directory. `DATA_DIR=:memory:` ⇒ `:memory:`. */
export function spacesDir(): string {
  const dir = dataDir();
  return dir === ":memory:" ? ":memory:" : join(dir, "spaces");
}
