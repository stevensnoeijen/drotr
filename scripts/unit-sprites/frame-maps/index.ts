import type { UnitType } from '../../../src/game/data/units';
import type { UnitFrameMap } from '../frame-map';
import { CROSSBOWSOLDIER_FRAME_MAP } from './crossbowsoldier';
import { JUGGERNAUT_FRAME_MAP } from './juggernaut';
import { KNIGHT_FRAME_MAP } from './knight';
import { SWORDSMEN_FRAME_MAP } from './swordsmen';

/** Every unit type whose sprites have been migrated to a frame map. */
export const FRAME_MAPS: Partial<Record<UnitType, UnitFrameMap>> = {
  swordsmen: SWORDSMEN_FRAME_MAP,
  crossbowsoldier: CROSSBOWSOLDIER_FRAME_MAP,
  knight: KNIGHT_FRAME_MAP,
  juggernaut: JUGGERNAUT_FRAME_MAP,
};
