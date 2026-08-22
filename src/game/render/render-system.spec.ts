import { World } from 'miniplex';
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/types';
import { RenderSystem } from './render-system';

function addEntity(world: World<Entity>, x = 0): Entity {
  return world.add({
    transform: { position: { x, y: 0 }, rotation: 0 },
    renderable: { shape: 'circle', color: 0xffffff, size: 4 },
  });
}

describe('RenderSystem', () => {
  it('creates exactly one container per entity added, via onEntityAdded', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    new RenderSystem(renderable, parent);

    addEntity(world, 1);
    addEntity(world, 2);
    addEntity(world, 3);

    expect(parent.children.length).toBe(3);
  });

  it('destroys the container and returns children.length to baseline when an entity is removed', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    new RenderSystem(renderable, parent);

    const a = addEntity(world, 1);
    addEntity(world, 2);
    expect(parent.children.length).toBe(2);

    const [view] = parent.children;
    world.remove(a);

    expect(parent.children.length).toBe(1);
    expect(view.destroyed).toBe(true);
  });

  it('adding N then removing all N leaves zero retained references', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    const entities = [addEntity(world, 1), addEntity(world, 2), addEntity(world, 3)];
    expect(system.size).toBe(3);

    for (const entity of entities) {
      world.remove(entity);
    }

    expect(parent.children.length).toBe(0);
    expect(system.size).toBe(0);
  });

  it('sync copies transform position/rotation onto each view', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    const entity = addEntity(world, 5);
    entity.transform!.position.x = 42;
    entity.transform!.rotation = 1.5;

    system.sync();

    const [view] = parent.children;
    expect(view.position.x).toBe(42);
    expect(view.rotation).toBe(1.5);
  });

  it('dispose unsubscribes and destroys any still-tracked views', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    addEntity(world, 1);
    const [view] = parent.children;

    system.dispose();

    expect(view.destroyed).toBe(true);
    expect(system.size).toBe(0);

    // Further world changes must not throw or re-add views after dispose.
    addEntity(world, 2);
    expect(system.size).toBe(0);
  });
});
