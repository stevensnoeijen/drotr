/** Currently targeted entity ID, if any. */
export interface Target {
  entityId: number;
  /**
   * Whether the player ordered this target specifically (right-click on an
   * enemy unit — see `attackSelectedTarget` in
   * `~/game/systems/input-system`), as opposed to it being auto-picked by
   * `~/game/systems/perception-system`.
   *
   * A manual target is *sticky*: `runPerceptionScan` leaves it alone instead
   * of re-picking the nearest enemy every interval, so a unit sent across the
   * map at one particular enemy engages *that* one rather than whatever it
   * happens to walk past. It stops being manual only when the targeted unit
   * dies (perception drops it like any other dead target) or the player
   * issues a new order (see `cancelAttackOrder` in
   * `~/game/combat/attack-order`).
   *
   * Absent (the common case) means auto-picked and freely re-evaluated. Kept
   * as a flag on `Target` rather than a sibling component so "who is this
   * unit fighting, and who decided that" can never drift apart — a target
   * set without its provenance is exactly the bug this guards against.
   */
  manual?: boolean;
}
