import { Container, Graphics } from 'pixi.js';
import type { Query, With } from 'miniplex';

import type { Entity, Renderable } from '~/game/ecs/types';
import { createHealthBar, drawHealthBarFill, markDirtyOnHealthChange, type HealthBarView } from './health-bar';

/** The subset of {@link Entity} a {@link RenderSystem} can draw. */
export type RenderableEntity = With<Entity, 'transform' | 'renderable'>;

/** An entity with a health bar the render system also tracks HP for. */
type LivingRenderableEntity = With<Entity, 'transform' | 'renderable' | 'health'>;

/** Per-entity view state the render system tracks beyond the Pixi container. */
interface EntityView {
  container: Container;
  healthBar?: HealthBarView;
}

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
  private readonly views = new Map<RenderableEntity, EntityView>();

  private readonly handleAdded = (entity: RenderableEntity): void => {
    const container = new Container();
    container.addChild(drawRenderable(entity.renderable));

    const view: EntityView = { container };
    if (entity.health) {
      const healthBar = createHealthBar(entity.renderable.size);
      container.addChild(healthBar.container);
      drawHealthBarFill(healthBar.fill, entity.health);
      view.healthBar = healthBar;
      this.lastHealth.set(entity as LivingRenderableEntity, entity.health.current);
    }

    // Container is itself a child of the parent, so destroying it (via
    // `destroy({ children: true })` in handleRemoved/dispose) destroys the
    // health bar's own container — and the graphics inside it — with it.
    this.views.set(entity, view);
    this.parent.addChild(container);
  };

  private readonly handleRemoved = (entity: RenderableEntity): void => {
    const view = this.views.get(entity);
    if (!view) {
      return;
    }
    view.container.destroy({ children: true });
    this.views.delete(entity);
    this.lastHealth.delete(entity as LivingRenderableEntity);
  };

  /** Last HP drawn per living entity, so {@link sync} can spot a change. */
  private readonly lastHealth = new Map<LivingRenderableEntity, number>();

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

  /**
   * Copies each tracked entity's transform onto its view, then — for entities
   * with a health bar — checks whether `health.current` has drifted from the
   * last HP drawn. A mismatch marks the entity's `renderable.dirty` so any
   * other system can observe it too, and redraws the bar's fill immediately.
   * An unchanged HP touches neither the flag nor the graphics: only dirty
   * entities redraw. Call once per frame.
   */
  public sync(): void {
    for (const [entity, view] of this.views) {
      view.container.position.set(entity.transform.position.x, entity.transform.position.y);
      view.container.rotation = entity.transform.rotation;

      if (entity.health) {
        markDirtyOnHealthChange(entity as LivingRenderableEntity, this.lastHealth);
      }

      if (entity.renderable.dirty && view.healthBar && entity.health) {
        drawHealthBarFill(view.healthBar.fill, entity.health);
        entity.renderable.dirty = false;
      }
    }
  }

  /** Unsubscribes from the query and destroys any still-tracked views. */
  public dispose(): void {
    this.query.onEntityAdded.unsubscribe(this.handleAdded);
    this.query.onEntityRemoved.unsubscribe(this.handleRemoved);
    for (const view of this.views.values()) {
      view.container.destroy({ children: true });
    }
    this.views.clear();
    this.lastHealth.clear();
  }
}
