import { cellPosition, spawnUnit } from '~/game/data/spawn';
import { cellPositionToVector, cellSizeOf, tilesToCells } from '~/lib/grid';
import type { Scenario } from './types';

/**
 * Two blue-vs-red swordsmen pairs, exercising unit rendering, placement,
 * attack-range behaviour and real-time combat independent of any map: one
 * pair placed in adjacent half-tile movement cells so they're immediately
 * within melee range and start trading blows on the spot, the other placed
 * four and a half tiles (nine cells) apart — out of melee range but inside
 * their five-tile aggro range — so they have to close the distance under
 * `SeekSystem` first, then stop at range and fight. Either way the health
 * bars drain a swing at a time, one `attackCooldown` apart. Also a
 * blue-knight-vs-red-swordsman duel in diagonally adjacent cells, so they
 * fight immediately, showing off the knight's damage and health lopsidedness
 * against infantry. Prefixed `test`: it exists to test the engine, not to
 * demonstrate a real gameplay setup.
 *
 * Laid out in half-tile movement cells (see `cellSizeOf`); rows and columns
 * that the comments below give in tiles are converted with `tilesToCells`.
 */
export const testScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description:
    'Two swordsmen pairs: one in adjacent cells fighting, one 4.5 tiles apart that closes in before fighting. Plus a knight-vs-swordsman duel, a movement-speed race, and two crossbow duels.',
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

    // Knight-vs-swordsman duel: diagonally adjacent cells, so they're
    // immediately within melee range (counted in 8-way cell steps) and start
    // trading blows on load. Diagonal rather than side by side because the
    // knight is drawn a full tile (two cells) wide while occupying one cell:
    // orthogonally adjacent, it would visibly cover part of the swordsman.
    // Tile row 12 sits clear above the maze block (which starts at tile row
    // 16) and away from every other spawn above. The knight's damage and
    // health advantage should read clearly here: it wins with HP to spare
    // while both health bars drain.
    const duelRow = tilesToCells(12);
    spawnUnit(world, {
      type: 'knight',
      team: 'blue',
      position: cellPosition(leftCol, duelRow, cellSize),
    }, cellSize);
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(leftCol + 1, duelRow + 1, cellSize),
    }, cellSize);

    // Knight, swordsman and crossbowsoldier, each on its own row, ordered
    // the same distance in parallel: exercises per-unit-type MoveSpeed
    // — the knight's higher movementSpeed makes it visibly pull
    // ahead. Each targets a point on its own row (not a shared point) so
    // the straight-line paths run side by side instead of converging onto
    // one destination, where a trailing unit would otherwise look like
    // it's following the leader in single file. Rows are a full tile apart
    // so the knight, drawn a tile wide, doesn't cover the swordsman's lane.
    // Run in the open area above the maze block (which starts at tile col
    // 16, row 16), so the straight-line paths don't clip its walls.
    const knightRow = tilesToCells(5);
    const swordsmanRow = tilesToCells(6);
    const crossbowsoldierRow = tilesToCells(7);
    const raceStartCol = leftCol;
    const raceDistanceCols = tilesToCells(10);

    const knight = spawnUnit(world, {
      type: 'knight',
      team: 'blue',
      position: cellPosition(raceStartCol, knightRow, cellSize),
    }, cellSize);
    knight.moveTarget = {
      position: cellPositionToVector(raceStartCol + raceDistanceCols, knightRow, cellSize),
    };

    const swordsman = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(raceStartCol, swordsmanRow, cellSize),
    }, cellSize);
    swordsman.moveTarget = {
      position: cellPositionToVector(raceStartCol + raceDistanceCols, swordsmanRow, cellSize),
    };

    const crossbowsoldier = spawnUnit(world, {
      type: 'crossbowsoldier',
      team: 'blue',
      position: cellPosition(raceStartCol, crossbowsoldierRow, cellSize),
    }, cellSize);
    crossbowsoldier.moveTarget = {
      position: cellPositionToVector(raceStartCol + raceDistanceCols, crossbowsoldierRow, cellSize),
    };

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
