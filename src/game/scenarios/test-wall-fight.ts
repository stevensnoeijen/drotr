import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * Cells either side of one of the `test` map's maze walls — the long
 * horizontal wall at row 21, whose only gap is at its far east end (cols
 * 44-46). Four cells apart in a straight line, which is inside a swordsman's
 * `aggroRange` (5), so they auto-acquire each other immediately despite
 * having no way to reach each other except the long way round.
 *
 * Deliberately hard-coded to that map's geometry rather than derived from
 * whatever map happens to be loaded: the whole point of this scenario is a
 * specific known-awkward wall, and a generic "find me two cells across some
 * wall" search would place the pair somewhere different (and less
 * interesting) per map.
 */
export const WALL_PAIR = {
  /** North of the wall, in the corridor above it. */
  blue: { col: 20, row: 19 },
  /** South of the wall, four cells away in a straight line through it. */
  red: { col: 20, row: 23 },
} as const;

/**
 * A second group in the open corridor north of that same wall: one blue unit
 * with two reds strung out to its east — the near one inside its
 * `aggroRange` (5), the far one well outside it.
 */
export const ESCORT_GROUP = {
  blue: { col: 24, row: 19 },
  nearRed: { col: 28, row: 19 },
  farRed: { col: 32, row: 19 },
} as const;

/**
 * A blue and a red swordsman on opposite sides of a maze wall on the `test`
 * map, plus a second blue unit with two reds in the open beside it.
 *
 * It exists to exercise #195 by hand, which nothing else did — every other
 * scenario puts its combatants in open ground where a straight line is
 * always available:
 *
 * - **Routing around a wall.** The paired-off blue and red see each other
 *   through the wall (4 cells apart, well inside `aggroRange`) but have no
 *   line to each other. `SeekSystem` should route the blue unit east along
 *   the corridor, through the wall's only gap, and back west to the red one,
 *   rather than pressing into the wall between them. Load it with
 *   `?debug=paths,targets` to watch the route and the target line.
 * - **Auto-target re-evaluation while moving.** The escort blue unit sits
 *   with two reds strung out to its east, so the target it picks changes as
 *   things die or move, and an in-flight route has to be replanned for the
 *   new one.
 * - **The manual attack-target order.** Select the escort blue unit and
 *   right-click the *far* red one, which sits beyond its `aggroRange`
 *   entirely: it must walk past the near red to fight the one it was ordered
 *   at, rather than being retargeted to whatever is closest or having the
 *   order dropped for being out of range.
 *
 * Prefixed `test-`: it exists to exercise the engine, not to demonstrate a
 * real gameplay setup. Its positions assume the `test` map (`?map=test`); on
 * the blank map there is no wall, and the pair simply closes and fights in a
 * straight line.
 */
export const testWallFightScenario: Scenario = {
  id: 'test-wall-fight',
  title: 'Test: wall fight',
  description:
    'Blue and red swordsmen on opposite sides of a maze wall, plus a blue unit with two reds in the open.',
  setup: (world) => {
    const spawn = (team: 'blue' | 'red', { col, row }: { col: number; row: number }) =>
      spawnUnit(world, { type: 'swordsmen', team, position: cellPosition(col, row) });

    spawn('blue', WALL_PAIR.blue);
    spawn('red', WALL_PAIR.red);

    spawn('blue', ESCORT_GROUP.blue);
    spawn('red', ESCORT_GROUP.nearRed);
    spawn('red', ESCORT_GROUP.farRed);
  },
};
