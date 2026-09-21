import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Locates the local, gitignored copy of the original game's CD data.
 *
 * The `.MAP`/`.ART` files are original commercial game content and are not
 * committed to this repository (see `docs/MAP_FORMAT.md`), so anything that
 * reads them has to tolerate their absence. Tests that need the real bytes
 * skip themselves when they aren't here.
 */

/** Overrides where the CD data is looked up, for checkouts that keep it elsewhere. */
export const CD_DIR_ENV_VAR = 'DROTR_CD_DIR';

/** Absolute path of the CD data directory, whether or not it exists. */
export function cdDir(): string {
  return process.env[CD_DIR_ENV_VAR] ?? path.join(process.cwd(), '.cd');
}

/** Absolute path of a file inside the CD data directory, e.g. `ART/BATTLE.ART`. */
export function cdPath(relativePath: string): string {
  return path.join(cdDir(), relativePath);
}

/** Whether a CD file is available locally. */
export function hasCdFile(relativePath: string): boolean {
  return fs.existsSync(cdPath(relativePath));
}

/** Reads a CD file into memory. */
export function readCdFile(relativePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(cdPath(relativePath)));
}
