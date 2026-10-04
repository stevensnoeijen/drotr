import { Container, Graphics, Text } from 'pixi.js';

import { parseFootprints, type TileRect } from '~/game/map/construction-sites';
import type { MapObject, MapObjectLayer } from '~/game/map/load-tiled-map';

/**
 * Debug drawing of a map's object layers (`spawns`, `constructions`, ...):
 * nothing in the game reads these layers' art, so this is only ever shown
 * through the `tile-layers` debug option.
 *
 * - A point object is a dot with its name beside it.
 * - A rectangle object is an outline of its bounds, with its name inside the
 *   top-left corner.
 * - Every `footprint:<level>` property (`x,y,width,height` in tiles, as on
 *   a construction site) is an outline of the tiles that level occupies.
 *
 * Colours go by the object's class (`type`), and by layer name for objects
 * without one, so spawns and each construction category read apart.
 */

const DOT_RADIUS = 6;
const LABEL_OFFSET = DOT_RADIUS + 4;
const LABEL_FONT_SIZE = 14;
const RECT_LABEL_INSET = 2;
const FOOTPRINT_FILL_ALPHA = 0.15;

const COLOURS: Readonly<Record<string, number>> = {
  spawns: 0xffe14d,
  castle: 0xff4d4d,
  tower: 0xffa500,
  bridge: 0x4dd2ff,
};
const DEFAULT_COLOUR = 0xffffff;

/** The debug colour of `object` on the layer called `layerName`. */
export function objectColour(object: Pick<MapObject, 'type'>, layerName: string): number {
  return COLOURS[object.type] ?? COLOURS[layerName] ?? DEFAULT_COLOUR;
}

/**
 * Every `footprint:<level>` property of `object`, parsed. A value that isn't
 * four comma-separated numbers is skipped.
 */
export function objectFootprints(object: Pick<MapObject, 'properties'>): TileRect[] {
  return Object.values(parseFootprints(object.properties));
}

/**
 * Draws one object layer into a new container, labelled with the layer's
 * name and starting out hidden.
 */
export function buildObjectLayerContainer(layer: MapObjectLayer, tileSize: number): Container {
  const container = new Container({ label: layer.name, visible: false });
  const shapes = new Graphics();
  container.addChild(shapes);

  for (const object of layer.objects) {
    const colour = objectColour(object, layer.name);

    for (const footprint of objectFootprints(object)) {
      shapes
        .rect(
          footprint.x * tileSize,
          footprint.y * tileSize,
          footprint.width * tileSize,
          footprint.height * tileSize
        )
        .fill({ color: colour, alpha: FOOTPRINT_FILL_ALPHA })
        // A pixel line stays one screen pixel wide at any zoom, so outlines
        // don't vanish when the map is zoomed far out.
        .stroke({ color: colour, pixelLine: true });
    }

    const isRect = !object.point && object.width > 0 && object.height > 0;
    if (isRect) {
      shapes
        .rect(object.x, object.y, object.width, object.height)
        .stroke({ color: colour, pixelLine: true });
    } else {
      shapes
        .circle(object.x, object.y, DOT_RADIUS)
        .fill(colour)
        .stroke({ width: 1, color: 0x000000 });
    }
    if (object.name) {
      const label = new Text({
        text: object.name,
        style: {
          fontFamily: 'monospace',
          fontSize: LABEL_FONT_SIZE,
          fill: colour,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      if (isRect) {
        label.position.set(object.x + RECT_LABEL_INSET, object.y + RECT_LABEL_INSET);
      } else {
        label.position.set(object.x + LABEL_OFFSET, object.y - LABEL_FONT_SIZE / 2);
      }
      container.addChild(label);
    }
  }
  return container;
}
