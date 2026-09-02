/**
 * Detection/aggro range in grid cells — how far a unit's `PerceptionSystem`
 * scan looks for an enemy to target. Configured independently of
 * `AttackRange` so a unit can spot an enemy from further away than it
 * can actually hit (e.g. a melee unit aggroing before it's in strike range).
 */
export interface AggroRange {
  value: number;
}
