import { describe, expect, it } from 'vitest';

import type { MapTileLayer } from './load-tiled-map';
import {
  defaultTileLayerVisibility,
  effectiveTileLayerVisibility,
  tileLayerInfo,
  toggleTileLayer,
  type TileLayerInfo,
} from './tile-layer-visibility';

/** The `buildings` map's tile layers: terrain and intact shown, ruined hidden. */
const BUILDINGS: TileLayerInfo[] = [
  { name: 'terrain', visible: true },
  { name: 'intact', visible: true },
  { name: 'ruined', visible: false },
];

describe('tileLayerInfo', () => {
  it("keeps each layer's name and default visibility, in order, without its data", () => {
    const layers: MapTileLayer[] = [
      { name: 'terrain', visible: true, data: [1, 2] },
      { name: 'ruined', visible: false, data: [0, 3] },
    ];
    expect(tileLayerInfo(layers)).toEqual([
      { name: 'terrain', visible: true },
      { name: 'ruined', visible: false },
    ]);
  });
});

describe('defaultTileLayerVisibility', () => {
  it("starts every layer from the map's own visible flag", () => {
    expect(defaultTileLayerVisibility(BUILDINGS)).toEqual([true, true, false]);
  });

  it('is empty for a map with no tile layers', () => {
    expect(defaultTileLayerVisibility([])).toEqual([]);
  });
});

describe('toggleTileLayer', () => {
  it("flips one layer, starting from the map's defaults", () => {
    expect(toggleTileLayer(BUILDINGS, undefined, 1)).toEqual([true, false, false]);
    expect(toggleTileLayer(BUILDINGS, undefined, 2)).toEqual([true, true, true]);
  });

  it('flips from the current state, and back again', () => {
    const intactOff = toggleTileLayer(BUILDINGS, undefined, 1);
    const ruinedOn = toggleTileLayer(BUILDINGS, intactOff, 2);
    expect(ruinedOn).toEqual([true, false, true]);
    expect(toggleTileLayer(BUILDINGS, ruinedOn, 2)).toEqual([true, false, false]);
  });

  it('does not mutate its input', () => {
    const current = [true, true, false];
    toggleTileLayer(BUILDINGS, current, 0);
    expect(current).toEqual([true, true, false]);
  });

  it('ignores an out-of-range index', () => {
    expect(toggleTileLayer(BUILDINGS, undefined, 3)).toEqual([true, true, false]);
    expect(toggleTileLayer(BUILDINGS, undefined, -1)).toEqual([true, true, false]);
  });

  it("starts over from the defaults when the state doesn't match the layers", () => {
    expect(toggleTileLayer(BUILDINGS, [false], 0)).toEqual([false, true, false]);
  });
});

describe('effectiveTileLayerVisibility', () => {
  const toggled = [false, false, true];

  it('applies the toggled state while the option is enabled', () => {
    expect(effectiveTileLayerVisibility(BUILDINGS, toggled, true)).toEqual(toggled);
  });

  it("falls back to the map's defaults while the option is off", () => {
    expect(effectiveTileLayerVisibility(BUILDINGS, toggled, false)).toEqual([true, true, false]);
  });

  it("uses the map's defaults when nothing was toggled yet", () => {
    expect(effectiveTileLayerVisibility(BUILDINGS, undefined, true)).toEqual([true, true, false]);
  });

  it("ignores toggles that don't match the layers, e.g. from another map", () => {
    expect(effectiveTileLayerVisibility(BUILDINGS, [false, true], true)).toEqual([true, true, false]);
  });
});
