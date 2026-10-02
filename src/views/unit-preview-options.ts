import { UNIT_TYPES, type UnitType } from '~/game/data/units';
import {
  DIRECTIONS,
  UNIT_ACTIONS,
  parseAnimationKey,
  type AnimationTeam,
  type Direction,
  type UnitAction,
} from '~/game/render/sprites/animation-key';
import type { UnitManifest } from '~/game/render/sprites/unit-manifest';

/**
 * Option logic for the unit preview page (`#/unit-preview`),
 * kept apart from the Pixi rendering so it can be tested on its own.
 */

/** What the player is showing. */
export interface AnimationSelection {
  unit: UnitType;
  team: AnimationTeam;
  action: UnitAction;
  direction: Direction;
  loop: boolean;
}

/** The choices one unit's manifest offers. */
export interface AnimationOptions {
  teams: readonly AnimationTeam[];
  actions: readonly UnitAction[];
  directions: readonly Direction[];
}

/**
 * Every unit with frames in the shared atlas, found from its animation
 * keys (so a newly packed unit shows up without code changes), in
 * `UNIT_TYPES` order. Keys that don't parse are ignored.
 */
export function atlasUnits(animationKeys: Iterable<string>): UnitType[] {
  const found = new Set<UnitType>();
  for (const key of animationKeys) {
    const parsed = parseAnimationKey(key);
    if (parsed) found.add(parsed.unit);
  }
  return UNIT_TYPES.filter((unit) => found.has(unit));
}

/** The teams, actions (in canonical order) and directions a manifest declares. */
export function animationOptions(manifest: UnitManifest): AnimationOptions {
  return {
    teams: manifest.teams,
    actions: UNIT_ACTIONS.filter((action) => manifest.actions[action]),
    directions: DIRECTIONS,
  };
}

const pick = <T>(options: readonly T[], wanted: unknown): T | undefined =>
  options.includes(wanted as T) ? (wanted as T) : options[0];

/**
 * Turns a possibly partial or stale request into a selection the unit can
 * actually play: anything the manifest doesn't offer falls back to its
 * first option. `loop` defaults to the manifest's own setting for the
 * action. Returns `undefined` when there is no unit (or no action) at all.
 */
export function resolveSelection(
  units: readonly UnitType[],
  manifests: Partial<Record<UnitType, UnitManifest>>,
  requested: Partial<AnimationSelection>
): AnimationSelection | undefined {
  const unit = pick(units, requested.unit);
  const manifest = unit && manifests[unit];
  if (!unit || !manifest) return undefined;
  const options = animationOptions(manifest);
  const team = pick(options.teams, requested.team);
  const action = pick(options.actions, requested.action);
  const direction = pick(options.directions, requested.direction);
  if (!team || !action || !direction) return undefined;
  return {
    unit,
    team,
    action,
    direction,
    loop: requested.loop ?? manifest.actions[action]!.loop,
  };
}

/** Reads a requested selection from `?unit=&team=&action=&direction=&loop=`. */
export function selectionFromParams(
  params: URLSearchParams
): Partial<AnimationSelection> {
  const requested: Partial<AnimationSelection> = {};
  const unit = params.get('unit');
  const team = params.get('team');
  const action = params.get('action');
  const direction = params.get('direction');
  const loop = params.get('loop');
  if (unit) requested.unit = unit as UnitType;
  if (team) requested.team = team as AnimationTeam;
  if (action) requested.action = action as UnitAction;
  if (direction) requested.direction = direction as Direction;
  if (loop === '1' || loop === '0') requested.loop = loop === '1';
  return requested;
}
