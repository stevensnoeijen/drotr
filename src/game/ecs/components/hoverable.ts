/**
 * Tag marking an entity that can be hovered/inspected (for debug tooltips).
 * Like `Selectable`, modelled as `true` so archetype queries can key off
 * its presence. Includes all units regardless of team, unlike `selectable`.
 */
export type Hoverable = true;
