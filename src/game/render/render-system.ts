import { Container, Graphics } from 'pixi.js';
import type { Query, With } from 'miniplex';

import type { Entity, Renderable } from '~/game/ecs/types';

/** The subset of {@link Entity} a {@link RenderSystem} can draw. */
export type RenderableEntity = With<Entity, 'transform' | 'renderable'>;

/** Draws a {@link Renderable}'s primitive shape into a fresh Graphics. */
export function drawRenderable({ shape, color, size }: Renderable): Graphics {
  const graphics = new Graphics();
  if (shape === 'circle') {
    graphics.circle(0, 0, size);
  } else if (shape === 'triangle') {
    graphics.poly([0, -size, size, size, -size, size]);
  } else {
    graphics.rect(-size, -size, size * 2, size * 2);
  }
  return graphics.fill(color);
}

/**
 * Keeps one Pixi `Container` per renderable entity in sync with the ECS,
 * reactively: it subscribes to the query's `onEntityAdded`/`onEntityRemoved`
 * events instead of polling, so entities added or removed after construction
 * are picked up immediately and never leak their view.
 *
 * Positions live in the ECS (`transform`) — call {@link sync} once per
 * rendered frame to copy them onto the views; this class never mutates the
 * simulation.
 */
export class RenderSystem {
  private readonly query: Query<RenderableEntity>;
  private readonly views = new Map<RenderableEntity, Container>();

  private readonly handleAdded = (entity: RenderableEntity): void => {
    const view = new Container();
    view.addChild(drawRenderable(entity.renderable));
    this.views.set(entity, view);
    this.parent.addChild(view);
  };

  private readonly handleRemoved = (entity: RenderableEntity): void => {
    const view = this.views.get(entity);
    if (!view) {
      return;
    }
    view.destroy({ children: true });
    this.views.delete(entity);
  };

  constructor(
    query: Query<RenderableEntity>,
    private readonly parent: Container
  ) {
    this.query = query;
    this.query.onEntityAdded.subscribe(this.handleAdded);
    this.query.onEntityRemoved.subscribe(this.handleRemoved);
  }

  /** Number of views currently tracked — exposed for leak tests. */
  public get size(): number {
    return this.views.size;
  }

  /** Copies each tracked entity's transform onto its view. Call once per frame. */
  public sync(): void {
    for (const [entity, view] of this.views) {
      view.position.set(entity.transform.position.x, entity.transform.position.y);
      view.rotation = entity.transform.rotation;
    }
  }

  /** Unsubscribes from the query and destroys any still-tracked views. */
  public dispose(): void {
    this.query.onEntityAdded.unsubscribe(this.handleAdded);
    this.query.onEntityRemoved.unsubscribe(this.handleRemoved);
    for (const view of this.views.values()) {
      view.destroy({ children: true });
    }
    this.views.clear();
  }
}
