/**
 * Packs unit spritesheets out of the real `ART/BATTLE.ART`, via
 * `./unit-sprites.ts` and the committed frame maps in `./frame-maps/`.
 *
 * Run with `npm run pack:sprites [unit...]`; with no unit, every unit that
 * has a frame map is packed. Writes, per unit, to `public/assets/units/`:
 * - `<unit>.png`: the sheet image, straight RGBA;
 * - `<unit>.sheet.json`: the Pixi spritesheet, animations keyed by `AnimationKey`;
 * - `<unit>.json`: the unit manifest.
 *
 * Requires the CD data (`DROTR_CD_DIR`, defaulting to `.cd/`) locally — the
 * raw CD data is never committed, but these decoded outputs are.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { decodePcx } from '../../src/lib/art';
import { cdPath, hasCdFile } from '../../src/test/cd-assets';
import type { UnitType } from '../../src/game/data/units';

import { FRAME_MAPS } from './frame-maps';
import { encodeRgbaPng, packUnitSprites } from './unit-sprites';

const BATTLE_ART = 'ART/BATTLE.ART';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'assets', 'units');

function main(): void {
  const requested = process.argv.slice(2);
  const known = Object.keys(FRAME_MAPS) as UnitType[];
  const unknown = requested.filter((u) => !known.includes(u as UnitType));
  if (unknown.length > 0) {
    console.error(
      `No frame map for ${unknown.join(', ')}. Known units: ${known.join(', ')}.`
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
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const units = requested.length > 0 ? (requested as UnitType[]) : known;
  for (const unit of units) {
    const packed = packUnitSprites(image, FRAME_MAPS[unit]!);
    const png = path.join(OUTPUT_DIR, `${unit}.png`);
    const sheet = path.join(OUTPUT_DIR, `${unit}.sheet.json`);
    const manifest = path.join(OUTPUT_DIR, `${unit}.json`);
    fs.writeFileSync(png, encodeRgbaPng(packed));
    fs.writeFileSync(sheet, JSON.stringify(packed.sheet, null, 2) + '\n');
    fs.writeFileSync(manifest, JSON.stringify(packed.manifest, null, 2) + '\n');
    console.log(`Wrote ${png}, ${sheet} and ${manifest}.`);
  }
}

main();
