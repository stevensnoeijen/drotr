import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createAttachmentSystem } from './attachment-system';

describe('createAttachmentSystem', () => {
  it("copies the parent's position and rotation onto the attached entity", () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createAttachmentSystem(queries);

    const parent = world.add({
      id: 1,
      transform: { position: { x: 10, y: 20 }, rotation: 0 },
    });
    const attachment = world.add({
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      attachedTo: { entityId: 1 },
    });

    parent.transform.position.x = 30;
    parent.transform.position.y = 40;
    parent.transform.rotation = 1.5;

    system(world, 1 / 60);

    expect(attachment.transform.position).toEqual({ x: 30, y: 40 });
    expect(attachment.transform.rotation).toBe(1.5);
  });

  it('leaves an attachment whose parent no longer exists exactly where it was', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createAttachmentSystem(queries);

    const attachment = world.add({
      id: 2,
      transform: { position: { x: 5, y: 5 }, rotation: 0 },
      attachedTo: { entityId: 999 },
    });

    system(world, 1 / 60);

    expect(attachment.transform.position).toEqual({ x: 5, y: 5 });
  });

  it('never touches velocity, damage or target on the attachment', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createAttachmentSystem(queries);

    world.add({ id: 1, transform: { position: { x: 0, y: 0 }, rotation: 0 } });
    const attachment = world.add({
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      attachedTo: { entityId: 1 },
    });

    system(world, 1 / 60);

    expect(attachment.velocity).toBeUndefined();
    expect(attachment.damage).toBeUndefined();
    expect(attachment.target).toBeUndefined();
  });
});
