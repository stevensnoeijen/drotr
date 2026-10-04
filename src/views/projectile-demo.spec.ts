import { Container } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { arcOffset } from '~/game/render/projectile-arc';
import type { UnitSprites } from '~/game/render/sprites/unit-sprites';
import { committedAtlas, committedUnitSprites } from '~/test/unit-sprites-fixture';
import { createProjectileDemo } from './projectile-demo';

let sprites: UnitSprites;

beforeAll(() => {
  sprites = committedUnitSprites(committedAtlas());
});

/** The Pixi containers currently below the demo's layer. */
function views(stage: Container): Container[] {
  return (stage.children[0] as Container).children.filter(
    (child) => child.label !== 'markers'
  ) as Container[];
}

describe('createProjectileDemo', () => {
  it('does nothing until a rock is launched', () => {
    const stage = new Container();
    const demo = createProjectileDemo(sprites, stage);

    demo.step(0.1);

    expect(demo.activeCount).toBe(0);
  });

  it('lifts the rock along the arc in flight', () => {
    const stage = new Container();
    const demo = createProjectileDemo(sprites, stage);
    demo.launch();
    expect(demo.activeCount).toBe(1);

    let peak = 0;
    for (let i = 0; i < 20; i++) {
      demo.step(1 / 60);
      const rockView = views(stage).find((v) => v.children.length === 1 && v.position.x > 10);
      peak = Math.max(peak, -((rockView?.children[0] as Container | undefined)?.y ?? 0));
    }

    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(arcOffset(0.5, 76) + 1e-6);
  });

  it('plays the dirt burst once it lands, then leaves no views behind', () => {
    const stage = new Container();
    const demo = createProjectileDemo(sprites, stage);
    const baseline = views(stage).length;
    demo.launch();

    let sawEffect = false;
    for (let i = 0; i < 600 && demo.activeCount > 0; i++) {
      demo.step(1 / 60);
      sawEffect ||= views(stage).length > baseline && i > 10;
    }

    expect(sawEffect).toBe(true);
    expect(demo.activeCount).toBe(0);
    expect(views(stage)).toHaveLength(baseline);
  });

  it('destroys everything it added on dispose', () => {
    const stage = new Container();
    const demo = createProjectileDemo(sprites, stage);
    const layer = stage.children[0];
    demo.launch();
    demo.step(1 / 60);

    demo.dispose();

    expect(layer.destroyed).toBe(true);
  });
});
