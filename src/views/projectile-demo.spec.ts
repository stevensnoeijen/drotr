import { AnimatedSprite, Container } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { arcOffset } from '~/game/render/projectile-arc';
import { DIRECTIONS } from '~/game/render/sprites/animation-key';
import { spriteScale } from '~/game/render/render-system';
import type { UnitSprites } from '~/game/render/sprites/unit-sprites';
import { unitSpritesFromAtlas } from '~/game/render/sprites/load-unit-sprites';
import type { UnitManifest } from '~/game/render/sprites/unit-manifest';
import type { UnitType } from '~/game/data/units';
import { committedAtlas, committedManifest, committedUnitSprites } from '~/test/unit-sprites-fixture';
import {
  DEMO_FIRER_RENDERABLE,
  DEMO_FLIGHT_DISTANCE,
  DEMO_FIRE_INTERVAL_SECONDS,
  DEMO_HOLD_FRAME,
  DEMO_LAUNCH_FRAME,
  demoFrameIndices,
  createFireTimer,
  createProjectileDemo,
  demoFlight,
} from './projectile-demo';

let sprites: UnitSprites;

beforeAll(() => {
  const sheet = committedAtlas();
  // The preview loads the catapult's sprite data itself, for the scale.
  const manifests = new Map<UnitType, UnitManifest>(
    [...committedUnitSprites(sheet)].map(([type, data]) => [type, data.manifest])
  );
  manifests.set('catapult', committedManifest('catapult'));
  sprites = unitSpritesFromAtlas(sheet.animations, manifests);
});

const flight = demoFlight('e');
const options = { ...flight, impact: true };

/** The sprite views the demo has drawn into its layer. */
function views(parent: Container): Container[] {
  return (parent.children[0] as Container).children as Container[];
}

/** Whether any drawn view is the 8-frame dirt burst rather than a rock. */
function showsDirtBurst(parent: Container): boolean {
  return views(parent).some((view) => (view.children[0] as AnimatedSprite).textures.length === 8);
}

describe('demoFlight', () => {
  it.each(DIRECTIONS)('flies %s the full distance, centred on the origin', (direction) => {
    const { from, to } = demoFlight(direction);

    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(DEMO_FLIGHT_DISTANCE);
    expect(from.x + to.x).toBeCloseTo(0);
    expect(from.y + to.y).toBeCloseTo(0);
  });

  it('lands east of the catapult when it faces east, and north when it faces north', () => {
    expect(demoFlight('e').to.x).toBeGreaterThan(demoFlight('e').from.x);
    expect(demoFlight('n').to.y).toBeLessThan(demoFlight('n').from.y);
  });
});

describe('demoFrameIndices', () => {
  it('launches on frame 2 and holds on frame 8, counted from 1', () => {
    expect(DEMO_LAUNCH_FRAME).toBe(2);
    expect(DEMO_HOLD_FRAME).toBe(8);
    expect(demoFrameIndices(8)).toEqual({ launch: 1, hold: 7 });
  });

  it('holds on the last frame of a shorter attack', () => {
    expect(demoFrameIndices(5)).toEqual({ launch: 1, hold: 4 });
  });

  it('keeps a single-frame attack inside its one frame', () => {
    expect(demoFrameIndices(1)).toEqual({ launch: 0, hold: 0 });
  });
});

describe('createFireTimer', () => {
  it('fires a shot every 4 seconds', () => {
    expect(DEMO_FIRE_INTERVAL_SECONDS).toBe(4);
    const timer = createFireTimer();

    const shots: number[] = [];
    for (let i = 1; i <= 600; i++) {
      if (timer.advance(1 / 60)) shots.push(i / 60);
    }

    expect(shots).toHaveLength(2);
    expect(shots[0]).toBeCloseTo(4, 1);
    expect(shots[1]).toBeCloseTo(8, 1);
  });

  it('does not fire before the interval has passed', () => {
    const timer = createFireTimer(4);

    expect(timer.advance(3.9)).toBe(false);
    expect(timer.advance(0.2)).toBe(true);
  });

  it('keeps the remainder so slow frames do not stretch the cadence', () => {
    const timer = createFireTimer(4);

    expect(timer.advance(4.5)).toBe(true);
    expect(timer.advance(3.4)).toBe(false);
    expect(timer.advance(0.2)).toBe(true);
  });
});

describe('createProjectileDemo', () => {
  it('does nothing until a rock is launched', () => {
    const demo = createProjectileDemo(sprites, new Container(), options);

    demo.step(0.1);

    expect(demo.activeCount).toBe(0);
  });

  it('draws the rock at the catapult scale', () => {
    const parent = new Container();
    const demo = createProjectileDemo(sprites, parent, options);
    demo.launch();
    demo.step(1 / 60);

    const [rock] = views(parent);
    const sprite = rock.children[0] as Container;
    expect(sprite.scale.x).toBeCloseTo(spriteScale(DEMO_FIRER_RENDERABLE, sprites.get('catapult')!.manifest));
  });

  it('lifts the rock along its arc, never above the peak', () => {
    const parent = new Container();
    const demo = createProjectileDemo(sprites, parent, options);
    demo.launch();

    let peak = 0;
    for (let i = 0; i < 30; i++) {
      demo.step(1 / 60);
      const [rock] = views(parent);
      peak = Math.max(peak, -(rock.children[0] as Container).y);
    }

    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(arcOffset(0.5, DEMO_FLIGHT_DISTANCE) + 1e-6);
  });

  it('plays the dirt burst on landing, then leaves no views behind', () => {
    const parent = new Container();
    const demo = createProjectileDemo(sprites, parent, options);
    demo.launch();

    let sawBurst = false;
    for (let i = 0; i < 600 && demo.activeCount > 0; i++) {
      demo.step(1 / 60);
      sawBurst ||= showsDirtBurst(parent);
    }

    expect(sawBurst).toBe(true);
    expect(demo.activeCount).toBe(0);
    expect(views(parent)).toHaveLength(0);
  });

  it('skips the dirt burst when impact is off', () => {
    const parent = new Container();
    const demo = createProjectileDemo(sprites, parent, { ...flight, impact: false });
    demo.launch();

    let sawBurst = false;
    for (let i = 0; i < 600 && demo.activeCount > 0; i++) {
      demo.step(1 / 60);
      sawBurst ||= showsDirtBurst(parent);
    }

    expect(sawBurst).toBe(false);
    expect(demo.activeCount).toBe(0);
    expect(views(parent)).toHaveLength(0);
  });

  it('can fire again each time it is asked to', () => {
    const parent = new Container();
    const demo = createProjectileDemo(sprites, parent, options);

    demo.launch();
    demo.launch();

    expect(demo.activeCount).toBe(2);
  });

  it('destroys everything it added on dispose', () => {
    const parent = new Container();
    const demo = createProjectileDemo(sprites, parent, options);
    const layer = parent.children[0];
    demo.launch();
    demo.step(1 / 60);

    demo.dispose();

    expect(layer.destroyed).toBe(true);
  });
});
