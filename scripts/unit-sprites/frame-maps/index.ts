import type { UnitType } from '../../../src/game/data/units';
import type { UnitFrameMap } from '../frame-map';
import { BOLT_FRAME_MAP } from './bolt';
import { CANNON_FRAME_MAP } from './cannon';
import { CATAPULT_FRAME_MAP } from './catapult';
import { CROSSBOWSOLDIER_FRAME_MAP } from './crossbowsoldier';
import { IMPACT_DIRT_FRAME_MAP } from './impact-dirt';
import { JUGGERNAUT_FRAME_MAP } from './juggernaut';
import { KNIGHT_FRAME_MAP } from './knight';
import { ROCK_FRAME_MAP } from './rock';
import { SWORDSMEN_FRAME_MAP } from './swordsmen';

/** Every unit type whose sprites have been migrated to a frame map. */
export const FRAME_MAPS: Partial<Record<UnitType, UnitFrameMap>> = {
  swordsmen: SWORDSMEN_FRAME_MAP,
  crossbowsoldier: CROSSBOWSOLDIER_FRAME_MAP,
  knight: KNIGHT_FRAME_MAP,
  juggernaut: JUGGERNAUT_FRAME_MAP,
  catapult: CATAPULT_FRAME_MAP,
  cannon: CANNON_FRAME_MAP,
  bolt: BOLT_FRAME_MAP,
  rock: ROCK_FRAME_MAP,
  'impact-dirt': IMPACT_DIRT_FRAME_MAP,
};
