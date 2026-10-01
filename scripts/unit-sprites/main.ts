/**
 * Packs every unit's sprites out of the real `ART/BATTLE.ART`, via
 * `./unit-sprites.ts` and the committed frame maps in `./frame-maps/`.
 *
 * Run with `npm run pack:sprites`. It always regenerates everything, so the
 * output only depends on the frame maps and the `.ART`:
 * - `public/assets/units.png`: the shared atlas image, straight RGBA;
 * - `public/assets/units.json`: the shared Pixi spritesheet, animations
 *   keyed by `AnimationKey`;
 * - `public/assets/units/<unit>.json`: each unit's manifest.
 *
 * Requires the CD data (`DROTR_CD_DIR`, defaulting to `.cd/`) locally — the
 * raw CD data is never committed, but these decoded outputs are.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { decodePcx } from '../../src/lib/art';
import { cdPath, hasCdFile } from '../../src/test/cd-assets';

import { FRAME_MAPS } from './frame-maps';
import { encodeRgbaPng, packUnitAtlas } from './unit-sprites';

const BATTLE_ART = 'ART/BATTLE.ART';
const ASSETS_DIR = path.join(process.cwd(), 'public', 'assets');
const MANIFEST_DIR = path.join(ASSETS_DIR, 'units');

function main(): void {
  if (process.argv.length > 2) {
    console.error(
      'pack:sprites takes no arguments; it always packs every unit into the shared atlas.'
    );
    process.exitCode = 1;
    return;
  }
  if (!hasCdFile(BATTLE_ART)) {
    console.error(
      `Cannot find ${cdPath(BATTLE_ART)}.\n` +
        'The CD data is not committed to this repository; ' +
        'place a local copy under .cd/ (or point DROTR_CD_DIR at it) before running this script.'
    );
    process.exitCode = 1;
    return;
  }

  const image = decodePcx(new Uint8Array(fs.readFileSync(cdPath(BATTLE_ART))));
  const packed = packUnitAtlas(image, Object.values(FRAME_MAPS));

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  const png = path.join(ASSETS_DIR, 'units.png');
  const sheet = path.join(ASSETS_DIR, 'units.json');
  fs.writeFileSync(png, encodeRgbaPng(packed));
  fs.writeFileSync(sheet, JSON.stringify(packed.sheet, null, 2) + '\n');
  console.log(`Wrote ${png} and ${sheet}.`);

  for (const [unit, manifest] of Object.entries(packed.manifests)) {
    const file = path.join(MANIFEST_DIR, `${unit}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${file}.`);
  }
}

main();
