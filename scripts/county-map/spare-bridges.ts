import type { BridgeBank, TileRect } from '../dracula-exe';

/**
 * A complete bridge drawn in `BUILDING.MAP` that no `DRACULA.EXE` prefab slot
 * points at. They were found by grouping the intact overlay's bridge tiles
 * into connected pieces and dropping everything inside a slot's rect; every
 * piece below has both end caps and a full deck. Nothing in a county places
 * them, but the art is there, so the `prefabs` layer marks them too.
 */
export interface SpareBridge {
  readonly level: 'wood' | 'stone' | 'stone-wide';
  readonly orientation: 'vertical' | 'horizontal';
  readonly bank: BridgeBank;
  /** Tiles along the span. */
  readonly length: number;
  readonly rect: TileRect;
}

function spare(
  level: SpareBridge['level'],
  orientation: SpareBridge['orientation'],
  bank: BridgeBank,
  x: number,
  y: number,
  width: number,
  height: number
): SpareBridge {
  const length = orientation === 'vertical' ? height : width;
  return { level, orientation, bank, length, rect: { x, y, width, height } };
}

/**
 * Every spare bridge, in reading order of the map. The bank follows the end
 * cap tiles, as for the slot bridges (see `docs/MAP_FORMAT.md`, "Bridges").
 * Their `ruined` overlay, where it has any, is a row or column of tile 389
 * down the deck.
 */
export const SPARE_BRIDGES: readonly SpareBridge[] = [
  // Two-tile wood bridges: just a start cap and an end cap.
  spare('wood', 'vertical', 'grass', 12, 5, 1, 2),
  spare('wood', 'horizontal', 'grass', 18, 25, 2, 1),
  spare('wood', 'horizontal', 'rock', 18, 27, 2, 1),
  // Stone-wide, longer than any slot bridge of the same shape.
  spare('stone-wide', 'vertical', 'grass', 17, 9, 3, 10),
  spare('stone-wide', 'vertical', 'grass', 23, 7, 3, 9),
  spare('stone', 'vertical', 'rock', 20, 29, 2, 4),
  spare('stone', 'vertical', 'rock', 26, 29, 2, 7),
  spare('stone', 'horizontal', 'grass', 39, 40, 7, 2),
  // Four rock-bank stone-wide bridges side by side, lengths 4 to 7.
  spare('stone-wide', 'vertical', 'rock', 51, 40, 3, 4),
  spare('stone-wide', 'vertical', 'rock', 54, 40, 3, 5),
  spare('stone-wide', 'vertical', 'rock', 57, 40, 3, 6),
  spare('stone-wide', 'vertical', 'rock', 60, 40, 3, 7),
  spare('stone', 'horizontal', 'rock', 28, 48, 5, 2),
  spare('stone-wide', 'horizontal', 'rock', 25, 50, 5, 3),
  spare('stone-wide', 'horizontal', 'rock', 30, 50, 6, 3),
];
