/**
 * Attack range in unit-placement (half-tile) cells, counted in 8-way cell
 * steps. `spawnUnit` converts it from the unit data's tiles (see
 * `attackRangeInCells`); a melee range of 1 means an adjacent cell.
 */
export interface AttackRange {
  value: number;
}
