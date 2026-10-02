/**
 * How many unit-placement cells a unit covers, as a `width` x `height`
 * rectangle: axis-aligned and fixed regardless of which way the unit is
 * facing (rotating a footprint with facing is not implemented).
 *
 * A unit's `Transform.position` is always the **centre of this rectangle**,
 * never the centre of a single cell with the rest of the block hanging off
 * it: a cell centre when both sides are odd (1x1, 3x3, ...), the shared
 * corner of the block's cells when both are even (2x2, ...), or a shared
 * edge when only one side is. See `~/game/navigation/footprint`, whose
 * helpers (`footprintCentre`, `anchorCellAt`, `snapToFootprint`,
 * `isAtFootprintCentre`, `footprintGap`) every world<->cell conversion for a
 * unit goes through, so spawning, movement, occupancy, attack-cell
 * selection and rendering all agree on the same anchor.
 *
 * Absent means 1x1, which is every unit but the knight — see `footprintOf`
 * in `~/game/data/units` (the unit-definition default, in cells) and in
 * `~/game/navigation/footprint` (the entity-component default).
 */
export interface Footprint {
  width: number;
  height: number;
}
