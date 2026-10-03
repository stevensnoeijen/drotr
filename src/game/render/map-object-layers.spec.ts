import { Container, Graphics, Text } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { MapObject } from '~/game/map/load-tiled-map';

import { buildObjectLayerContainer, objectColour, objectFootprints } from './map-object-layers';

function object(overrides: Partial<MapObject> = {}): MapObject {
  return {
    name: 'castle-1',
    type: 'castle',
    x: 100,
    y: 200,
    width: 0,
    height: 0,
    point: true,
    properties: {},
    ...overrides,
  };
}

describe('objectFootprints', () => {
  it('parses every footprint:<level> property, skipping everything else', () => {
    expect(
      objectFootprints(
        object({
          properties: {
            'footprint:1': '10,20,11,11',
            'footprint:2': '8,18,15,15',
            'footprint:bad': '1,2,3',
            levels: '1,2',
          },
        })
      )
    ).toEqual([
      { x: 10, y: 20, width: 11, height: 11 },
      { x: 8, y: 18, width: 15, height: 15 },
    ]);
  });
});

describe('objectColour', () => {
  it('colours by class, falling back to the layer name, then white', () => {
    expect(objectColour({ type: 'bridge' }, 'constructions')).toBe(0x4dd2ff);
    expect(objectColour({ type: '' }, 'spawns')).toBe(0xffe14d);
    expect(objectColour({ type: '' }, 'other')).toBe(0xffffff);
  });
});

describe('buildObjectLayerContainer', () => {
  it('builds a hidden container, labelled by layer, with a name label per named object', () => {
    const container = buildObjectLayerContainer(
      {
        name: 'constructions',
        visible: true,
        objects: [
          object({ properties: { 'footprint:1': '1,1,2,2' } }),
          object({ name: '', type: 'tower' }),
          object({ name: 'area', point: false, width: 40, height: 40 }),
        ],
      },
      40
    );

    expect(container).toBeInstanceOf(Container);
    expect(container.label).toBe('constructions');
    expect(container.visible).toBe(false);
    expect(container.children[0]).toBeInstanceOf(Graphics);
    const labels = container.children.filter((child): child is Text => child instanceof Text);
    expect(labels.map((label) => label.text)).toEqual(['castle-1', 'area']);
    // A point's label sits beside the dot; a rectangle's inside its top-left corner.
    expect(labels[0].position).toMatchObject({ x: 110, y: 193 });
    expect(labels[1].position).toMatchObject({ x: 102, y: 202 });
  });
});
