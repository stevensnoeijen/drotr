import type { UnitType } from '../../../src/game/data/units';
import type { UnitFrameMap } from '../frame-map';
import { SWORDSMEN_FRAME_MAP } from './swordsmen';

/** Every unit type whose sprites have been migrated to a frame map. */
export const FRAME_MAPS: Partial<Record<UnitType, UnitFrameMap>> = {
  swordsmen: SWORDSMEN_FRAME_MAP,
};
