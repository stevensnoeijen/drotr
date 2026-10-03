import type { UnitType } from '~/game/data/units';
import {
  ANIMATION_TEAMS,
  DIRECTIONS,
  UNIT_ACTIONS,
  type AnimationTeam,
  type Direction,
  type UnitAction,
} from './animation-key';

/**
 * Per-unit sprite manifest, emitted by the sprite pipeline next to the sheet
 * at `public/assets/units/<unit>.json` (see {@link unitManifestPath}) and
 * read by the runtime renderer. Animation keys and frame names are defined in
 * `animation-key.ts`.
 *
 * ```jsonc
 * { "atlas": "/assets/units.json",
 *   "frameSize": [32, 32], "anchor": [0.5, 0.75],
 *   "teams": ["blue", "red"],            // or ["neutral"] for siege units
 *   "actions": {
 *     "idle":   { "frames": 1,  "fps": 0,  "loop": false },
 *     "move":   { "frames": 8,  "fps": 10, "loop": true },
 *     "attack": { "frames": 10, "fps": 12, "loop": false, "hitFrame": 7 },
 *     "dead":   { "frames": 6,  "fps": 8,  "loop": false, "holdLast": true } } }
 * ```
 *
 * Rules:
 * - A unit may omit actions it has no frames for (e.g. a cannon).
 * - Single-frame actions are valid (`idle` reuses the most static frame of the
 *   move cycle). `frames` is the per-direction frame count and is the same for
 *   every direction and team.
 * - `directions` (optional) lists the facings an action has frames for, when
 *   that is fewer than all eight (the juggernaut only attacks north, at the
 *   castle doors). Omitted means every direction. A unit facing another way
 *   plays {@link playableDirection} instead.
 * - `hitFrame` (attack only, optional) is the 0-based frame index at which
 *   damage lands, so the renderer can line the swing up with `CombatSystem`,
 *   which applies damage the instant the attack cooldown elapses. It must be
 *   less than `frames`.
 * - `anchor` is the normalised point of the frame placed on the unit position.
 */
export interface ActionManifest {
  /** Frames per direction (at least 1). */
  frames: number;
  /** Playback speed; `0` is allowed for single-frame actions. */
  fps: number;
  loop: boolean;
  /** The facings this action has frames for; omitted means all of {@link DIRECTIONS}. */
  directions?: Direction[];
  /** Attack only: frame index at which damage lands. */
  hitFrame?: number;
  /** Keep showing the final frame once finished (e.g. a corpse). */
  holdLast?: boolean;
}

/** The facings `action` has frames for: its `directions`, else all eight. */
export function actionDirections(
  action: Pick<ActionManifest, 'directions'>
): readonly Direction[] {
  return action.directions ?? DIRECTIONS;
}

/**
 * The facing to show for `direction` in `action`: `direction` itself when
 * the action has frames for it, otherwise the nearest facing it does have
 * (the first on a tie), so a unit never lacks a frame to draw.
 */
export function playableDirection(
  action: Pick<ActionManifest, 'directions'>,
  direction: Direction
): Direction {
  const available = actionDirections(action);
  if (available.includes(direction)) return direction;
  const count = DIRECTIONS.length;
  const from = DIRECTIONS.indexOf(direction);
  const distance = (d: Direction) => {
    const delta = Math.abs(DIRECTIONS.indexOf(d) - from);
    return Math.min(delta, count - delta);
  };
  return available.reduce((best, d) => (distance(d) < distance(best) ? d : best));
}

export interface UnitManifest {
  /** Public URL path of the spritesheet holding this unit's frames, e.g. {@link UNIT_ATLAS_PATH}. */
  atlas?: string;
  /** Frame width and height in pixels. */
  frameSize: [number, number];
  /** Normalised [x, y] anchor within the frame. */
  anchor: [number, number];
  teams: AnimationTeam[];
  actions: Partial<Record<UnitAction, ActionManifest>>;
}

/** Public URL path of a unit's manifest; derived from the unit type. */
export function unitManifestPath(unit: UnitType): string {
  return `/assets/units/${unit}.json`;
}

/**
 * Public URL path of the one Pixi spritesheet JSON every unit's frames are
 * packed into (image: `units.png` beside it). Its `animations` are keyed by
 * `AnimationKey`, which already starts with the unit type, so units share
 * it without colliding.
 */
export const UNIT_ATLAS_PATH = '/assets/units.json';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPositiveInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) > 0;
const isNonNegInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0;

function validateAction(name: string, a: unknown, errors: string[]): void {
  const at = `actions.${name}`;
  if (!isRecord(a)) {
    errors.push(`${at} must be an object`);
    return;
  }
  for (const k of Object.keys(a)) {
    if (!['frames', 'fps', 'loop', 'hitFrame', 'holdLast', 'directions'].includes(k)) {
      errors.push(`${at}.${k} is not a known field`);
    }
  }
  if (!isPositiveInt(a.frames))
    errors.push(`${at}.frames must be a positive integer`);
  if (typeof a.fps !== 'number' || !Number.isFinite(a.fps) || a.fps < 0) {
    errors.push(`${at}.fps must be a non-negative number`);
  }
  if (typeof a.loop !== 'boolean') errors.push(`${at}.loop must be a boolean`);
  if (a.holdLast !== undefined && typeof a.holdLast !== 'boolean') {
    errors.push(`${at}.holdLast must be a boolean`);
  }
  if (a.directions !== undefined) {
    const listed = a.directions;
    if (
      !Array.isArray(listed) ||
      listed.length === 0 ||
      !listed.every((d) => (DIRECTIONS as readonly unknown[]).includes(d)) ||
      new Set(listed).size !== listed.length
    ) {
      errors.push(`${at}.directions must be a non-empty list of distinct directions`);
    }
  }
  // `dead` is the dying sequence: it plays once and stays on the corpse.
  if (name === 'dead' && a.loop === true) {
    errors.push(`${at}.loop must be false`);
  }
  if (a.hitFrame !== undefined) {
    if (name !== 'attack') {
      errors.push(`${at}.hitFrame is only allowed on attack`);
    } else if (!isNonNegInt(a.hitFrame)) {
      errors.push(`${at}.hitFrame must be a non-negative integer`);
    } else if (isPositiveInt(a.frames) && a.hitFrame >= a.frames) {
      errors.push(
        `${at}.hitFrame ${a.hitFrame} is outside the frame range 0..${a.frames - 1}`
      );
    }
  }
}

/** Returns a list of problems with `value`; empty means it is a valid {@link UnitManifest}. */
export function validateUnitManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['manifest must be an object'];

  const { atlas, frameSize, anchor, teams, actions } = value;
  if (atlas !== undefined && (typeof atlas !== 'string' || atlas === '')) {
    errors.push('atlas must be a non-empty string');
  }
  if (
    !Array.isArray(frameSize) ||
    frameSize.length !== 2 ||
    !frameSize.every(isPositiveInt)
  ) {
    errors.push('frameSize must be [width, height] of positive integers');
  }
  if (
    !Array.isArray(anchor) ||
    anchor.length !== 2 ||
    !anchor.every((n) => typeof n === 'number' && n >= 0 && n <= 1)
  ) {
    errors.push('anchor must be [x, y] numbers between 0 and 1');
  }
  if (!Array.isArray(teams) || teams.length === 0) {
    errors.push('teams must be a non-empty array');
  } else {
    for (const t of teams) {
      if (!(ANIMATION_TEAMS as readonly unknown[]).includes(t))
        errors.push(`unknown team ${JSON.stringify(t)}`);
    }
    if (new Set(teams).size !== teams.length)
      errors.push('teams must not repeat');
    if (teams.includes('neutral') && teams.length > 1)
      errors.push('neutral cannot be combined with other teams');
  }
  if (!isRecord(actions)) {
    errors.push('actions must be an object');
  } else {
    const names = Object.keys(actions);
    if (names.length === 0)
      errors.push('actions must define at least one action');
    for (const name of names) {
      if (!(UNIT_ACTIONS as readonly string[]).includes(name)) {
        errors.push(`unknown action ${JSON.stringify(name)}`);
      } else {
        validateAction(name, actions[name], errors);
      }
    }
  }
  return errors;
}

export function isUnitManifest(value: unknown): value is UnitManifest {
  return validateUnitManifest(value).length === 0;
}

/** Validates and returns a manifest, throwing with every problem listed. */
export function parseUnitManifest(value: unknown): UnitManifest {
  const errors = validateUnitManifest(value);
  if (errors.length > 0)
    throw new Error(`Invalid unit manifest: ${errors.join('; ')}`);
  return value as UnitManifest;
}
