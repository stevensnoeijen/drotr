import { World } from 'miniplex';
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
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

  it('gives an entity with health a health bar child, redrawn only when HP changes', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      health: { current: 10, max: 10 },
    });

    const [view] = parent.children;
    // shape graphic + health bar container + death-mark graphic.
    expect(view.children.length).toBe(3);

    // Unchanged HP: sync must not mark the entity dirty.
    system.sync();
    expect(entity.renderable!.dirty).toBeFalsy();

    entity.health!.current = 5;
    system.sync();
    // sync() both marks and clears dirty (having redrawn) within the same call.
    expect(entity.renderable!.dirty).toBe(false);
  });

  it('hides health bars by default and shows them once made visible', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      health: { current: 10, max: 10 },
    });

    const [view] = parent.children;
    const [, healthBarContainer] = view.children;
    expect(healthBarContainer.visible).toBe(false);

    system.setHealthBarsVisible(true);
    expect(healthBarContainer.visible).toBe(true);
  });

  it('makes health bars visible from construction when requested', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    new RenderSystem(renderable, parent, true);

    world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      health: { current: 10, max: 10 },
    });

    const [view] = parent.children;
    const [, healthBarContainer] = view.children;
    expect(healthBarContainer.visible).toBe(true);
  });

  it('shows selection marks only while selected, health bars hidden by default', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      selectable: true,
    });

    const [view] = parent.children;
    const [, selectionMarks] = view.children;
    expect(selectionMarks.visible).toBe(false);

    world.addComponent(entity, 'selected', true);
    system.sync();
    expect(selectionMarks.visible).toBe(true);

    world.removeComponent(entity, 'selected');
    system.sync();
    expect(selectionMarks.visible).toBe(false);
  });

  it('shows the health bar of a selected unit even with health bars globally hidden', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      health: { current: 10, max: 10 },
      selectable: true,
    });

    const [view] = parent.children;
    const [, , healthBarContainer] = view.children;
    expect(healthBarContainer.visible).toBe(false);

    world.addComponent(entity, 'selected', true);
    system.sync();
    expect(healthBarContainer.visible).toBe(true);

    world.removeComponent(entity, 'selected');
    system.sync();
    expect(healthBarContainer.visible).toBe(false);
  });

  it('marks a unit dead once its health bar is redrawn at 0 HP', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    const system = new RenderSystem(renderable, parent);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      health: { current: 10, max: 10 },
    });

    const [view] = parent.children;
    const [, , deathMark] = view.children;
    expect((deathMark as Graphics).context.instructions.length).toBe(0);

    entity.health!.current = 0;
    system.sync();

    expect((deathMark as Graphics).context.instructions.length).toBeGreaterThan(0);
  });

  it('destroys the health bar along with its parent container', () => {
    const world = new World<Entity>();
    const { renderable } = createQueries(world);
    const parent = new Container();
    new RenderSystem(renderable, parent);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
      health: { current: 10, max: 10 },
    });

    const [view] = parent.children;
    const [, healthBarContainer] = view.children;

    world.remove(entity);

    expect(view.destroyed).toBe(true);
    expect(healthBarContainer.destroyed).toBe(true);
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
