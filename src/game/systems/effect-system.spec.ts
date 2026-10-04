import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { spawnEffect } from '~/game/combat/spawn-effect';
import { effectDuration } from '~/game/data/effects';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createEffectSystem } from './effect-system';

const renderable = { shape: 'circle', color: 0xffffff, size: 6, extent: 8 } as const;

function setup() {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const system = createEffectSystem(queries);
  const effect = spawnEffect(world, {
    type: 'impact-dirt',
    position: { x: 10, y: 20 },
    sourceUnitType: 'crossbowsoldier',
    renderable,
  });
  return { world, queries, system, effect };
}

describe('spawnEffect', () => {
  it('adds a unit-less effect at the position', () => {
    const { world, effect } = setup();

    expect(world.entities).toContain(effect);
    expect(effect.transform).toEqual({ position: { x: 10, y: 20 }, rotation: 0 });
    expect(effect.effect).toEqual({ type: 'impact-dirt', sourceUnitType: 'crossbowsoldier', elapsed: 0 });
    expect(effect.unitType).toBeUndefined();
    expect(effect.team).toBeUndefined();
    expect(effect.health).toBeUndefined();
    expect(effect.hoverable).toBeUndefined();
    expect(effect.selectable).toBeUndefined();
  });
});

describe('createEffectSystem', () => {
  it('ages an effect each step', () => {
    const { world, system, effect } = setup();

    system(world, 0.1);

    expect(effect.effect!.elapsed).toBeCloseTo(0.1);
    expect(world.entities).toContain(effect);
  });

  it('removes the effect once its animation duration has passed', () => {
    const { world, queries, system, effect } = setup();
    const duration = effectDuration('impact-dirt');

    system(world, duration - 0.01);
    expect(queries.effects.size).toBe(1);

    system(world, 0.02);
    expect(queries.effects.size).toBe(0);
    expect(world.entities).not.toContain(effect);
  });
});
