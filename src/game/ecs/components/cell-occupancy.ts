/**
 * A unit's claim on the movement grid: which cell it stands in, and which
 * cell (if any) it is currently walking into.
 *
 * Units are grid-cell-based rather than free-floating circles, so "do these
 * two units overlap" is answered by cell identity instead of a pairwise
 * distance check. A unit at rest holds exactly its footprint's block of
 * cells — one, for every unit but the knight, whose 2x2 block is claimed and
 * released atomically (see `~/game/navigation/footprint#footprintOf` and
 * `OccupancyGrid.reserveBlock`/`releaseBlock`); a unit mid-step holds both
 * its origin block and its destination block — up to a 2x3 or 3x3 block for
 * a 2x2 unit stepping one cell — so nothing else can enter either while it
 * is straddling the boundary.
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
   * Row-major index of the **anchor** (top-left) cell of the block the unit
   * stands in, or `NO_CELL` before its first claim. The unit's own footprint
   * (`footprintOf`) says how large that block is; for a 1x1 unit the anchor
   * is simply the one cell it occupies.
   */
  cell: number;
  /**
   * Row-major index of the anchor cell of the block being walked into, or
   * `NO_CELL` when the unit is at rest and holds only {@link cell}'s block.
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
  /**
   * Whether a re-route has already been attempted for the current
   * unbroken stretch of being blocked. Reset to `false` the same moment
   * `blockedFor` resets to zero, so each fresh blockage gets exactly one
   * attempt to route around whoever is in the way — never a cascade of
   * replans against a corridor that just stays jammed.
   */
  rerouted: boolean;
}
