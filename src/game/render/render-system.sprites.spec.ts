import { World } from 'miniplex';
import { AnimatedSprite, Container, Graphics, type Spritesheet, type Ticker } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { spawnUnit, cellPosition } from '~/game/data/spawn';
import type { UnitType } from '~/game/data/units';
import type { Team } from '~/game/ecs/components';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { committedAtlas, committedUnitSprites } from '~/test/unit-sprites-fixture';
import { RenderSystem } from './render-system';
import type { UnitSprites } from './sprites/unit-sprites';

let sheet: Spritesheet;
let sprites: UnitSprites;

beforeAll(() => {
  sheet = committedAtlas();
  sprites = committedUnitSprites(sheet);
});

/** A world with a sprite-aware render system drawing into `parent`. */
function setup({ healthBarsVisible = false, sprites: data = sprites } = {}) {
  const world = new World<Entity>();
  const { renderable } = createQueries(world);
  const parent = new Container();
  const system = new RenderSystem(renderable, parent, healthBarsVisible, data);
  const spawn = (type: UnitType = 'swordsmen', team: Team = 'blue', cellSize = 16, col = 0) =>
    spawnUnit(world, { type, team, position: cellPosition(col, 0, cellSize) }, cellSize);
  return { world, parent, system, spawn };
}

/** The view container of the `index`-th entity added. */
const viewOf = (parent: Container, index = 0) => parent.children[index] as Container;

/** The animated sprite of a sprite view. */
function spriteOf(parent: Container, index = 0): AnimatedSprite {
  const [body] = viewOf(parent, index).children;
  expect(body).toBeInstanceOf(AnimatedSprite);
  return body as AnimatedSprite;
}

/** Advances a playing sprite as the shared ticker would, by `frames` of its own fps. */
function advance(sprite: AnimatedSprite, frames: number): void {
  // Pixi advances `animationSpeed` frames per 60 Hz tick; the small nudge
  // keeps float rounding from stopping a frame short.
  sprite.update({ deltaTime: (frames + 1e-6) / sprite.animationSpeed } as Ticker);
}

const animation = (key: string) => sheet.animations[key];

describe('RenderSystem sprite views', () => {
  describe('view selection', () => {
    it('draws a swordsman as an animated sprite with no shape, facing or death mark', () => {
      const { parent, spawn, system } = setup();
      const entity = spawn();

      const view = viewOf(parent);
      const sprite = spriteOf(parent);
      // The sprite, then the selection marks and the health bar — no
      // `shape` container (body, facing mark, death mark) at all.
      const [, selectionMarks, healthBar] = view.children;
      expect(view.children).toHaveLength(3);
      expect(selectionMarks).toBeInstanceOf(Graphics);
      expect(healthBar.position.x).toBe(-8);

      entity.transform!.rotation = 1.2;
      entity.health!.current = 0;
      system.sync();

      // Facing comes from which direction's frames play, never from turning
      // the sprite (or anything around it).
      expect(sprite.rotation).toBe(0);
      expect(view.rotation).toBe(0);
      // Nor is a death mark added once it dies.
      expect(view.children).toEqual([sprite, selectionMarks, healthBar]);
    });

    it('keeps drawing an entity without a unit type as its shape', () => {
      const { parent, world } = setup();
      world.add({
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
        renderable: { shape: 'stripe', color: 0xffffff, size: 4 },
      });

      const [shape] = viewOf(parent).children;
      expect(shape).not.toBeInstanceOf(AnimatedSprite);
      expect(shape.children[0]).toBeInstanceOf(Graphics);
    });

    it('throws for a sprite unit it has no sprite data for, rather than drawing a shape', () => {
      const { spawn, parent } = setup({ sprites: new Map() });

      expect(() => spawn()).toThrow('RenderSystem has no sprite data for "swordsmen" units');
      expect(parent.children).toHaveLength(0);
    });
  });

  describe('layout', () => {
    it.each([
      [16, 0.5],
      [20, 0.625],
    ])('fits the frame to the footprint box at cell size %i (scale %f)', (cellSize, scale) => {
      const { parent, spawn } = setup();
      spawn('swordsmen', 'blue', cellSize);

      const sprite = spriteOf(parent);
      expect(sprite.scale.x).toBe(scale);
      expect(sprite.scale.y).toBe(scale);
      // A 32 px frame spans the one-cell footprint exactly.
      expect(32 * sprite.scale.x).toBe(cellSize);
    });

    it("takes the anchor from the unit's manifest", () => {
      const { parent, spawn } = setup();
      spawn();

      const { anchor } = sprites.get('swordsmen')!.manifest;
      expect([spriteOf(parent).anchor.x, spriteOf(parent).anchor.y]).toEqual(anchor);
    });

    it('lays the selection marks and health bar out against the footprint box, as for shapes', () => {
      const { parent, spawn, system } = setup();
      const entity = spawn('swordsmen', 'blue', 20);

      const [, selectionMarks, healthBar] = viewOf(parent).children;
      expect(healthBar.position.x).toBe(-10);
      expect(selectionMarks.visible).toBe(false);
      expect(healthBar.visible).toBe(false);

      entity.selected = true;
      system.sync();
      expect(selectionMarks.visible).toBe(true);
      expect(healthBar.visible).toBe(true);
    });
  });

  describe('playback', () => {
    it('starts on the idle frame of its team and facing', () => {
      const { parent, spawn } = setup();
      spawn('swordsmen', 'red');

      const sprite = spriteOf(parent);
      expect(sprite.textures).toBe(animation('swordsmen.red.idle.n'));
      expect(sprite.playing).toBe(false);
    });

    it('swaps textures on the same sprite when the key changes, applying fps and loop', () => {
      const { parent, spawn, system } = setup();
      const entity = spawn();
      const sprite = spriteOf(parent);

      entity.velocity = { x: 1, y: 0 };
      entity.transform!.rotation = Math.PI / 2;
      system.sync();

      expect(spriteOf(parent)).toBe(sprite);
      expect(sprite.textures).toBe(animation('swordsmen.blue.move.e'));
      expect(sprite.animationSpeed).toBeCloseTo(
        sprites.get('swordsmen')!.manifest.actions.move!.fps / 60
      );
      expect(sprite.loop).toBe(true);
      expect(sprite.playing).toBe(true);
      expect(sprite.currentFrame).toBe(0);

      entity.velocity = { x: 0, y: 0 };
      system.sync();

      expect(spriteOf(parent)).toBe(sprite);
      expect(sprite.textures).toBe(animation('swordsmen.blue.idle.e'));
      expect(sprite.playing).toBe(false);
    });

    it('keeps playing an unchanged animation instead of restarting it', () => {
      const { parent, spawn, system } = setup();
      const entity = spawn();
      entity.velocity = { x: 0, y: 1 };
      entity.transform!.rotation = Math.PI;
      system.sync();
      const sprite = spriteOf(parent);

      advance(sprite, 3);
      expect(sprite.currentFrame).toBe(3);
      system.sync();
      system.sync();

      expect(sprite.currentFrame).toBe(3);
      expect(sprite.playing).toBe(true);
      // Looping: the walk cycle wraps around rather than stopping.
      advance(sprite, 6);
      expect(sprite.currentFrame).toBe(1);
      expect(sprite.playing).toBe(true);
    });

    it('plays the nearest available facing for an action without frames for the current one', () => {
      // Limit the swordsmen's attack to north in the manifest, as the
      // juggernaut's is.
      const base = sprites.get('swordsmen')!;
      const northOnly: UnitSprites = new Map([
        [
          'swordsmen',
          {
            ...base,
            manifest: {
              ...base.manifest,
              actions: {
                ...base.manifest.actions,
                attack: { ...base.manifest.actions.attack!, directions: ['n'] },
              },
            },
          },
        ],
      ]);
      const { parent, spawn, system } = setup({ sprites: northOnly });
      const entity = spawn('swordsmen', 'red');
      entity.transform!.rotation = Math.PI; // south
      entity.attackSwing = { elapsed: 0 };
      system.sync();
      const sprite = spriteOf(parent);

      // Facing south, it swings with the north frames...
      expect(sprite.textures).toBe(animation('swordsmen.red.attack.n'));

      // ...but still walks facing south.
      delete entity.attackSwing;
      entity.velocity = { x: 0, y: 1 };
      system.sync();
      expect(sprite.textures).toBe(animation('swordsmen.red.move.s'));
    });

    it('restarts the attack on every new swing and holds its last frame in between', () => {
      const { parent, spawn, system } = setup();
      const entity = spawn('swordsmen', 'red');
      entity.transform!.rotation = (3 * Math.PI) / 4;
      entity.attackSwing = { elapsed: 0 };
      system.sync();
      const sprite = spriteOf(parent);

      expect(sprite.textures).toBe(animation('swordsmen.red.attack.se'));
      expect(sprite.loop).toBe(false);
      advance(sprite, 5);
      entity.attackSwing.elapsed = 0.3;
      system.sync();
      // The same swing carries on.
      expect(sprite.currentFrame).toBe(5);

      advance(sprite, 20);
      // Plays once and stops on its last frame.
      expect(sprite.currentFrame).toBe(11);
      expect(sprite.playing).toBe(false);

      // Combat sets a new object for the next swing: same key, fresh attack.
      entity.attackSwing = { elapsed: 0 };
      system.sync();
      expect(sprite.textures).toBe(animation('swordsmen.red.attack.se'));
      expect(sprite.currentFrame).toBe(0);
      expect(sprite.playing).toBe(true);
    });

    it.each([
      ['blue', 0, 'n'],
      ['blue', Math.PI / 4, 'ne'],
      ['red', Math.PI, 's'],
      ['red', (5 * Math.PI) / 4, 'sw'],
      ['blue', -Math.PI / 2, 'w'],
      ['red', (7 * Math.PI) / 4, 'nw'],
    ] as const)('shows the %s team facing rotation %f as %s', (team, rotation, direction) => {
      const { parent, spawn, system } = setup();
      const entity = spawn('swordsmen', team);
      entity.velocity = { x: 1, y: 1 };
      entity.transform!.rotation = rotation;
      system.sync();

      expect(spriteOf(parent).textures).toBe(animation(`swordsmen.${team}.move.${direction}`));
    });
  });

  describe('death', () => {
    it('plays the dead animation once, holds its last frame and sorts the corpse behind', () => {
      const { parent, spawn, system } = setup({ healthBarsVisible: true });
      const entity = spawn('swordsmen', 'blue', 16, 0);
      spawn('swordsmen', 'blue', 16, 1);
      const [, , healthBar] = viewOf(parent).children;
      expect(healthBar.visible).toBe(true);

      entity.transform!.rotation = Math.PI / 2;
      entity.attackSwing = { elapsed: 0 };
      entity.health!.current = 0;
      entity.dead = { elapsed: 0 };
      system.sync();

      const sprite = spriteOf(parent);
      expect(sprite.textures).toBe(animation('swordsmen.blue.dead.e'));
      expect(sprite.loop).toBe(false);
      expect(sprite.playing).toBe(true);
      advance(sprite, 10);
      expect(sprite.currentFrame).toBe(3);
      expect(sprite.playing).toBe(false);
      system.sync();
      expect(sprite.currentFrame).toBe(3);

      expect(viewOf(parent, 0).zIndex).toBeLessThan(viewOf(parent, 1).zIndex);
      expect(healthBar.visible).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('leaves no views, children or live sprites after adding and removing N swordsmen', () => {
      const { world, parent, spawn, system } = setup();
      const entities = Array.from({ length: 5 }, (_, i) => spawn('swordsmen', 'blue', 16, i));
      const spriteViews = entities.map((_, i) => spriteOf(parent, i));
      entities[0].velocity = { x: 1, y: 0 };
      system.sync();

      for (const entity of entities) {
        world.remove(entity);
      }

      expect(system.size).toBe(0);
      expect(parent.children).toHaveLength(0);
      for (const sprite of spriteViews) {
        expect(sprite.destroyed).toBe(true);
        expect(sprite.playing).toBe(false);
      }
    });

    it('never destroys the shared atlas textures, on entity removal or dispose', () => {
      const { world, parent, spawn, system } = setup();
      const removed = spawn();
      spawn('swordsmen', 'red', 16, 1);
      const shown = [spriteOf(parent, 0).texture, spriteOf(parent, 1).texture];

      world.remove(removed);
      system.dispose();

      expect(parent.children).toHaveLength(0);
      for (const texture of shown) {
        expect(texture.destroyed).toBe(false);
      }
      for (const textures of Object.values(sheet.animations)) {
        for (const texture of textures) {
          expect(texture.destroyed).toBe(false);
        }
      }
      expect(sheet.textureSource.destroyed).toBe(false);

      // And a fresh render system (as after a remount) can draw from them again.
      const again = setup();
      again.spawn();
      expect(spriteOf(again.parent).textures).toBe(animation('swordsmen.blue.idle.n'));
    });
  });
});
