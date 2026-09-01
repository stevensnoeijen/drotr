/**
 * Tag marking an entity the player is allowed to select. Modelled as `true`
 * (the idiomatic miniplex tag) so it carries no data and archetype queries can
 * key off its mere presence.
 */
export type Selectable = true;
