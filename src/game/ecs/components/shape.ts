/**
 * How an entity is drawn by the (view-only) renderer. `stripe` is a thin,
 * elongated rectangle — currently only used for the crossbow unit's static
 * projectile visual (#161) — as opposed to `square`'s equal-sided one.
 */
export type Shape = 'circle' | 'square' | 'triangle' | 'stripe';
