import { Container, Graphics } from 'pixi.js';
import type { Query, With } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Renderable } from '~/game/ecs/components';
import { CELL_SIZE } from '~/lib/grid';
import {
  createHealthBar,
  drawDeathMark,
  drawHealthBarFill,
  markDirtyOnHealthChange,
  type HealthBarView,
} from './health-bar';

/** The subset of {@link Entity} a {@link RenderSystem} can draw. */
export type RenderableEntity = With<Entity, 'transform' | 'renderable'>;

/** An entity with a health bar the render system also tracks HP for. */
type LivingRenderableEntity = With<Entity, 'transform' | 'renderable' | 'health'>;

/** Per-entity view state the render system tracks beyond the Pixi container. */
interface EntityView {
  /** Positioned (never rotated) — holds `shape` plus every overlay below it. */
  container: Container;
  /**
   * Positioned only via `container`, rotated to `Transform.rotation` each
   * `sync()`. Holds the unit's shape and facing mark — the only parts that
   * should turn with the unit — kept out of `container` itself so the
   * overlays below (health bar, selection marks, death mark) stay
   * screen-aligned regardless of which way the unit is facing.
   */
  shape: Container;
  healthBar?: HealthBarView;
  /** Cross drawn over the shape once the entity's HP reaches 0. */
  deathMark?: Graphics;
  /** Black corner marks shown while the entity has a `selected` component. */
  selectionMarks?: Graphics;
}

/** Half the grid cell — the fixed boundary selection marks and the health bar are positioned against, independent of the unit shape's own (possibly smaller) render size. */
const CELL_HALF_EXTENT = CELL_SIZE / 2;

/**
 * Inset, in world units, of a unit's selection marks from the cell edge —
 * inward, so the marks stay inside the unit's own grid cell instead of
 * spilling into the neighboring one.
 */
const SELECTION_MARK_INSET = 2;

/** Length, in world units, of each corner mark's two arms. */
const SELECTION_MARK_ARM_LENGTH = 4;

/**
 * Draws small black "⌐"-shaped marks at the top-left and top-right corners
 * of a unit's grid cell, inset inward by {@link SELECTION_MARK_INSET} from
 * {@link CELL_HALF_EXTENT} — the cell's own edge, not the (possibly
 * smaller) shape's, so the marks stay put regardless of the shape's size.
 */
function drawSelectionMarks(): Graphics {
  const left = -CELL_HALF_EXTENT + SELECTION_MARK_INSET;
  const right = CELL_HALF_EXTENT - SELECTION_MARK_INSET;
  const top = -CELL_HALF_EXTENT + SELECTION_MARK_INSET;
  const arm = SELECTION_MARK_ARM_LENGTH;

  return new Graphics()
    .moveTo(left, top + arm)
    .lineTo(left, top)
    .lineTo(left + arm, top)
    .moveTo(right - arm, top)
    .lineTo(right, top)
    .lineTo(right, top + arm)
    .stroke({ width: 2, color: 0x000000 });
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

/** Size, relative to the unit shape's own `size`, of the facing indicator. */
const FACING_MARK_SCALE = 0.35;

/**
 * Draws a small black triangle inset from the top edge of a unit's shape,
 * pointing toward that edge (local -y, "up" at `Transform.rotation` 0) to
 * mark which way the unit is facing. Drawn once in local space rather than
 * re-rotated itself — {@link RenderSystem.sync} turns the `shape` container
 * (this mark included) to `Transform.rotation` each frame, so it swings
 * around to trail the direction of travel while the health bar, selection
 * marks, and death mark — siblings outside `shape` — stay screen-aligned.
 */
function drawFacingMark(size: number): Graphics {
  const markSize = size * FACING_MARK_SCALE;
  const tip = -size;
  const base = -size + markSize;

  return new Graphics()
    .poly([0, tip, markSize, base, -markSize, base])
    .fill(0x000000);
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

    const shape = new Container();
    shape.addChild(drawRenderable(entity.renderable));
    shape.addChild(drawFacingMark(entity.renderable.size));
    container.addChild(shape);

    const view: EntityView = { container, shape };
    if (entity.selectable) {
      const selectionMarks = drawSelectionMarks();
      selectionMarks.visible = Boolean(entity.selected);
      container.addChild(selectionMarks);
      view.selectionMarks = selectionMarks;
    }
    if (entity.health) {
      const healthBar = createHealthBar(CELL_HALF_EXTENT);
      healthBar.container.visible = this.healthBarsVisible || Boolean(entity.selected);
      container.addChild(healthBar.container);
      drawHealthBarFill(healthBar.fill, entity.health, healthBar.width);
      view.healthBar = healthBar;

      const deathMark = new Graphics();
      drawDeathMark(deathMark, entity.renderable.size, entity.health.current <= 0);
      container.addChild(deathMark);
      view.deathMark = deathMark;

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

  /** Whether health bars are currently shown, toggled via `?debug=health`. */
  private healthBarsVisible: boolean;

  constructor(
    query: Query<RenderableEntity>,
    private readonly parent: Container,
    healthBarsVisible = false
  ) {
    this.query = query;
    this.healthBarsVisible = healthBarsVisible;
    this.query.onEntityAdded.subscribe(this.handleAdded);
    this.query.onEntityRemoved.subscribe(this.handleRemoved);
  }

  /** Shows or hides every tracked (and future) entity's health bar. */
  public setHealthBarsVisible(visible: boolean): void {
    this.healthBarsVisible = visible;
    for (const [entity, view] of this.views) {
      if (view.healthBar) {
        view.healthBar.container.visible = visible || Boolean(entity.selected);
      }
    }
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
      view.shape.rotation = entity.transform.rotation;

      if (view.selectionMarks) {
        view.selectionMarks.visible = Boolean(entity.selected);
      }

      if (entity.health) {
        markDirtyOnHealthChange(entity as LivingRenderableEntity, this.lastHealth);
        if (view.healthBar) {
          view.healthBar.container.visible = this.healthBarsVisible || Boolean(entity.selected);
        }
      }

      if (entity.renderable.dirty && view.healthBar && entity.health) {
        drawHealthBarFill(view.healthBar.fill, entity.health, view.healthBar.width);
        if (view.deathMark) {
          drawDeathMark(view.deathMark, entity.renderable.size, entity.health.current <= 0);
        }
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
