/**
 * A unit's claim on the movement grid: which cell it stands in, and which
 * cell (if any) it is currently walking into.
 *
 * Units are grid-cell-based rather than free-floating circles, so "do these
 * two units overlap" is answered by cell identity instead of a pairwise
 * distance check. A unit at rest holds exactly one cell; a unit mid-step
 * holds two — its origin and its destination — so nothing else can enter
 * either while it is straddling the boundary.
 *
 * The cells themselves live in the shared `OccupancyGrid` (see
 * `~/game/navigation/occupancy-grid`), which layers over the map's terrain
 * collision buffer; this component is the per-entity half of that
 * bookkeeping, maintained by `~/game/systems/cell-occupancy-system`.
 */
export interface CellOccupancy {
  /**
   * Identity of this unit *within the occupancy grid*, handed out by
   * `OccupancyGrid.claimOccupantId()`. A flat `Int32Array` can only store
   * numbers, and `Entity.id` is optional (nothing guarantees a
   * test-constructed or inline entity has one), so the grid mints its own
   * dense, always-present id rather than depending on that.
   */
  occupantId: number;
  /**
   * Row-major index of the cell the unit stands in, or `NO_CELL` before its
   * first claim.
   */
  cell: number;
  /**
   * Row-major index of the cell being walked into, or `NO_CELL` when the
   * unit is at rest and holds only {@link cell}.
   */
  reserved: number;
  /**
   * Seconds spent held up by another unit occupying the cell ahead. Reset to
   * zero the moment the unit moves again; once it passes
   * `BLOCKED_GIVE_UP_SECONDS` the order is abandoned so a unit can never
   * wait forever behind a stationary neighbour.
   *
   * Doubling as the "who is waiting" marker is deliberate: the state rides
   * on the entity the movement pass already visits, so nothing has to
   * re-scan every unit to find the blocked ones.
   */
  blockedFor: number;
}
