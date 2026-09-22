/**
 * Generates `public/maps/terrain.tsx` and `public/maps/terrain.png` from
 * the real `ART/BATTLE.ART`, via `src/lib/art/terrain-tileset.ts`.
 *
 * Run with `npm run export:terrain-tileset`. Requires the CD data
 * (`DROTR_CD_DIR`, defaulting to `.cd/`) locally — that raw source data is
 * original commercial game content and is never committed, but its decoded
 * outputs (the generated `.tsx`/`.png` here) are.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PNG } from 'pngjs';

import {
  buildTerrainTilesetImage,
  buildTerrainTilesetXml,
  decodePcx,
} from '../src/lib/art';
import { cdPath, hasCdFile } from '../src/test/cd-assets';

const BATTLE_ART = 'ART/BATTLE.ART';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'maps');

function main(): void {
  if (!hasCdFile(BATTLE_ART)) {
    console.error(
      `Cannot find ${cdPath(BATTLE_ART)}.\n` +
        'The CD data is original game content and is not committed to this repository; ' +
        'place a local copy under .cd/ (or point DROTR_CD_DIR at it) before running this script.'
    );
    process.exitCode = 1;
    return;
  }

  const bytes = fs.readFileSync(cdPath(BATTLE_ART));
  const image = decodePcx(new Uint8Array(bytes));
  const tileset = buildTerrainTilesetImage(image);

  const png = new PNG({ width: tileset.width, height: tileset.height });
  png.data = Buffer.from(
    tileset.rgba.buffer,
    tileset.rgba.byteOffset,
    tileset.rgba.byteLength
  );

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'terrain.png'), PNG.sync.write(png));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'terrain.tsx'),
    buildTerrainTilesetXml()
  );

  console.log(
    `Wrote ${path.join(OUTPUT_DIR, 'terrain.tsx')} and ${path.join(OUTPUT_DIR, 'terrain.png')}.`
  );
}

main();
