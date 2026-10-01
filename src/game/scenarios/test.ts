import { cellPosition, spawnUnit } from '~/game/data/spawn';
import { cellSizeOf, tilesToCells } from '~/lib/grid';
import type { Scenario } from './types';

/**
 * Two blue-vs-red swordsmen pairs, exercising unit rendering, placement,
 * attack-range behaviour and real-time combat independent of any map: one
 * pair placed in adjacent half-tile movement cells so they're immediately
 * within melee range and start trading blows on the spot, the other placed
 * four and a half tiles (nine cells) apart — out of melee range but inside
 * their five-tile aggro range — so they have to close the distance under
 * `SeekSystem` first, then stop at range and fight. Either way the health
 * bars drain a swing at a time, one `attackCooldown` apart. Plus two
 * crossbow duels. The knight is left out until it gets a 2x2 multi-cell
 * footprint (#232); with it went the knight duel and the movement-speed
 * race, which only showed anything with the faster knight in it. Prefixed
 * `test`: it exists to test the engine, not to demonstrate a real gameplay
 * setup.
 *
 * Laid out in half-tile movement cells (see `cellSizeOf`); rows and columns
 * that the comments below give in tiles are converted with `tilesToCells`.
 */
export const testScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description:
    'Two swordsmen pairs: one in adjacent cells fighting, one 4.5 tiles apart that closes in before fighting. Plus two crossbow duels.',
  setup: (world, map) => {
    const cellSize = cellSizeOf(map);
    const leftCol = tilesToCells(2);
    const adjacentRow = tilesToCells(2);
    const separatedRow = tilesToCells(9);

    // Within melee range: adjacent movement cells.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(leftCol, adjacentRow, cellSize),
    }, cellSize);
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(leftCol + 1, adjacentRow, cellSize),
    }, cellSize);

    // Out of melee range, inside aggro range (5 tiles, 10 cells): nine
    // cells apart. An odd column gap (rather than an even one) keeps their eventual meeting point off any shared grid line —
    // closing symmetrically at equal speed over an even gap lands the
    // resting boundary exactly on a cell edge, which floating-point noise
    // then resolves to one cell or its neighbour unpredictably from run to
    // run. Nothing to do with collision correctness (cell-occupancy never
    // lets them share a cell either way), but it made this scenario's own
    // resting cell flicker for no reason.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(leftCol, separatedRow, cellSize),
    }, cellSize);
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(leftCol + 9, separatedRow, cellSize),
    }, cellSize);

    // Just below (south of) the maze block, lined up with its bottom exit
    // (tile cols 44-46), for exercising click-to-move into and through the
    // maze corridors: tile (45, 50).
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(tilesToCells(45), tilesToCells(50), cellSize),
    }, cellSize);

    // Two blue-vs-red crossbowsoldier pairs, top-right of the layout and
    // away from the swordsmen groups above: within each other's attack
    // range from the moment they spawn, so they start auto-engaging (and
    // firing real projectiles) on load: three tiles apart across, inside
    // their five-tile range, and the two pairs two tiles apart down.
    const crossbowRow = tilesToCells(2);
    const crossbowBlueCol = tilesToCells(56);
    const crossbowRedCol = tilesToCells(59);
    for (const row of [crossbowRow, crossbowRow + tilesToCells(2)]) {
      spawnUnit(world, {
        type: 'crossbowsoldier',
        team: 'blue',
        position: cellPosition(crossbowBlueCol, row, cellSize),
      }, cellSize);
      spawnUnit(world, {
        type: 'crossbowsoldier',
        team: 'red',
        position: cellPosition(crossbowRedCol, row, cellSize),
      }, cellSize);
    }
  },
};
