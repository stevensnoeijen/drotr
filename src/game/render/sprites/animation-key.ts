import type { UnitType } from '~/game/data/units';
import type { Team } from '~/game/ecs/components/team';

/**
 * Sprite animation-key contract, shared by the sprite pipeline (which emits
 * frames named after these keys) and the runtime renderer (which looks them
 * up). Key shape: `<unit>.<team>.<action>.<direction>`, e.g.
 * `swordsmen.red.move.nw`; an individual frame appends `_<NN>`, e.g.
 * `swordsmen.red.move.nw_01` (see {@link frameName}).
 */

export const UNIT_TYPES = [
  'swordsmen',
  'knight',
  'crossbowsoldier',
] as const satisfies readonly UnitType[];
/** `neutral` is used by units that are not team-coloured (e.g. siege units). */
export const ANIMATION_TEAMS = [
  'blue',
  'red',
  'neutral',
] as const satisfies readonly (Team | 'neutral')[];
export const UNIT_ACTIONS = ['idle', 'move', 'attack', 'dead'] as const;
/** Compass abbreviations: n = north, ne = northeast, and so on. */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

export type AnimationTeam = (typeof ANIMATION_TEAMS)[number];
export type UnitAction = (typeof UNIT_ACTIONS)[number];
export type Direction = (typeof DIRECTIONS)[number];

export type AnimationKey =
  `${UnitType}.${AnimationTeam}.${UnitAction}.${Direction}`;

export interface ParsedAnimationKey {
  unit: UnitType;
  team: AnimationTeam;
  action: UnitAction;
  direction: Direction;
}

export function animationKey(
  unit: UnitType,
  team: AnimationTeam,
  action: UnitAction,
  direction: Direction
): AnimationKey {
  return `${unit}.${team}.${action}.${direction}`;
}

const isOneOf = <T extends string>(
  list: readonly T[],
  value: string
): value is T => (list as readonly string[]).includes(value);

/** Parses a key built by {@link animationKey}; returns `undefined` if malformed. */
export function parseAnimationKey(key: string): ParsedAnimationKey | undefined {
  const parts = key.split('.');
  if (parts.length !== 4) return undefined;
  const [unit, team, action, direction] = parts;
  if (
    !isOneOf(UNIT_TYPES, unit) ||
    !isOneOf(ANIMATION_TEAMS, team) ||
    !isOneOf(UNIT_ACTIONS, action) ||
    !isOneOf(DIRECTIONS, direction)
  ) {
    return undefined;
  }
  return { unit, team, action, direction };
}

/**
 * Name of one frame within an animation: the key plus a 1-based, zero-padded
 * index, e.g. `swordsmen.red.move.nw_01`.
 */
export function frameName(key: AnimationKey, index: number): string {
  return `${key}_${String(index).padStart(2, '0')}`;
}
