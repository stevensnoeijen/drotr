import { AnimatedSprite, Container, Graphics, type Texture } from 'pixi.js';
import type { Query, With } from 'miniplex';

import type { UnitType } from '~/game/data/units';
import type { Entity } from '~/game/ecs/entity';
import type { Renderable } from '~/game/ecs/components';
import {
  animationKey,
  type AnimationKey,
  type AnimationTeam,
  type UnitAction,
} from './sprites/animation-key';
import { directionOf, unitActionOf } from './sprites/unit-animation';
import { playableDirection, type UnitManifest } from './sprites/unit-manifest';
import {
  animationSpeed,
  isSpriteUnitType,
  type UnitSpriteData,
  type UnitSprites,
} from './sprites/unit-sprites';
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

/**
 * Playback state of a sprite view's one `AnimatedSprite` — kept on the
 * view, not in the ECS, since it's purely presentational.
 */
interface SpriteAnimation {
  /**
   * Never rotated: the unit's facing is shown by which direction's frames
   * play, not by turning the sprite. Its textures are swapped in place
   * whenever the animation changes; it's never recreated.
   */
  sprite: AnimatedSprite;
  data: UnitSpriteData;
  /** The animation currently shown; unset until it's first applied. */
  key?: AnimationKey;
  /**
   * The entity's `attackSwing` as of the last `sync()`. Combat sets a new
   * object for every swing, so a different one under an unchanged attack
   * key means a fresh swing that should restart the attack animation.
   */
  swing: Entity['attackSwing'];
}

/**
 * Per-entity view state the render system tracks beyond the Pixi container.
 * A view is one of two kinds, chosen once per entity:
 *
 * - a **sprite view** (`animation`) for a fired projectile and for sprite
 *   unit types (see `SPRITE_UNIT_TYPES`): an animated sprite playing the
 *   animation derived from the entity's ECS state;
 * - a **shape view** (`shape`) for everything else: the primitive shape
 *   with its facing mark and, for units with health, its death mark.
 *
 * Both share the same overlays (selection marks, health bar) and z-order;
 * a projectile has none of the components that add them.
 */
interface EntityView {
  /**
   * Positioned (never rotated) — holds the unit's body (`shape` or
   * `animation.sprite`) plus every overlay below it.
   */
  container: Container;
  /**
   * Shape views only. Positioned only via `container`, rotated to
   * `Transform.rotation` each `sync()`. Holds the unit's shape, facing mark
   * and death mark — the parts that should turn with the unit — kept out of
   * `container` itself so the overlays below (health bar, selection marks)
   * stay screen-aligned regardless of which way the unit is facing.
   */
  shape?: Container;
  /** Sprite views only: the animated sprite and its playback state. */
  animation?: SpriteAnimation;
  healthBar?: HealthBarView;
  /**
   * Shape views only: cross drawn over the shape once the entity's HP
   * reaches 0, turning with it. A sprite view's `dead` animation plays
   * that role instead.
   */
  deathMark?: Graphics;
  /** Black corner marks shown while the entity has a `selected` component. */
  selectionMarks?: Graphics;
}

/**
 * `zIndex` a unit's container sorts at within its (sortable) parent layer —
 * dead units drawn behind every living one, so a corpse never visually sits
 * on top of (and gets mistaken for occluding) a live unit passing over its
 * cell. Two fixed values rather than, say, HP-based sorting: this is the
 * only distinction that currently matters, and it only ever moves one way
 * (alive to dead), so there's no ordering to maintain among the living or
 * among the dead themselves.
 */
const ALIVE_Z_INDEX = 1;
const DEAD_Z_INDEX = 0;

/**
 * Whether a unit's health bar should be shown: the usual
 * globally-toggled-or-selected rule, but never for a dead unit — a corpse's
 * HP is a fixed, uninteresting 0, and its bar would just be another static
 * shape cluttering a battle's aftermath. The death mark ({@link drawDeathMark})
 * is the death indicator; the bar has nothing left to say once it's earned.
 */
function shouldShowHealthBar(entity: LivingRenderableEntity, healthBarsVisible: boolean): boolean {
  return entity.health.current > 0 && (healthBarsVisible || Boolean(entity.selected));
}

/**
 * Inset, in world units, of a unit's selection marks from the edge of its
 * unit-type box — inward, so the marks sit on the unit rather than
 * spilling onto its neighbours.
 */
const SELECTION_MARK_INSET = 2;

/** Length, in world units, of each corner mark's two arms. */
const SELECTION_MARK_ARM_LENGTH = 4;

/**
 * Draws small black "⌐"-shaped marks at the top-left and top-right corners
 * of a unit's box, inset inward by {@link SELECTION_MARK_INSET} from
 * `extent` — the unit-type size's own edge (see {@link overlayExtent}), so
 * a knight's marks frame the full tile it's drawn on and an infantry
 * unit's frame its half-tile.
 */
function drawSelectionMarks(extent: number): Graphics {
  const left = -extent + SELECTION_MARK_INSET;
  const right = extent - SELECTION_MARK_INSET;
  const top = -extent + SELECTION_MARK_INSET;
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

/**
 * Half-extent a unit's selection marks and health bar are laid out against:
 * its unit-type box (`renderable.extent`), or its drawn shape's own size
 * when it has none.
 */
export function overlayExtent(renderable: Renderable): number {
  return renderable.extent ?? renderable.size;
}

/** Draws a {@link Renderable}'s primitive shape into a fresh Graphics. */
function drawRenderable({ shape, color, size }: Renderable): Graphics {
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
 * Uniform scale that fits a sprite unit's frames to its footprint box (the
 * same box its overlays are laid out against, see {@link overlayExtent}):
 * the frame's larger side spans the box exactly. For a one-cell swordsman
 * with 32 px frames that's 0.5 on a 32 px-tile map and 0.625 on a 40 px-tile
 * one. Deliberately not native 1:1 or tile-relative, so a figure (smaller
 * than in the original game) always matches the cells it occupies.
 */
export function spriteScale(renderable: Renderable, manifest: UnitManifest): number {
  return (2 * overlayExtent(renderable)) / Math.max(...manifest.frameSize);
}

/**
 * The sprite type, team set and action a sprite entity shows. A projectile
 * only ever flies, so it always plays its `move` frames, in its one
 * (neutral) colourway; a unit's come from its own type, team and state.
 */
function spriteStateOf(entity: RenderableEntity): {
  type: UnitType;
  team: AnimationTeam;
  action: UnitAction;
} {
  if (entity.projectile) {
    return { type: entity.projectile.type, team: 'neutral', action: 'move' };
  }
  return {
    type: entity.unitType!,
    team: entity.team ?? 'neutral',
    action: unitActionOf(entity),
  };
}

/**
 * Uniform scale of a fired projectile's sprite: the world-per-art-pixel
 * factor of its firer's sprite, so the projectile is drawn at its original
 * pixel size next to the unit that fired it (a 14 px bolt frame covers
 * 14/32 of the world length a 32 px crossbow soldier frame does). `firer`
 * is the firer's manifest, and `renderable` the projectile's, which
 * `fireProjectile` lays out in the firer's box: fitting the firer's frame
 * to that box is exactly the scale the firer itself is drawn at.
 */
export function projectileSpriteScale(renderable: Renderable, firer: UnitManifest): number {
  return spriteScale(renderable, firer);
}

/** What a sprite entity should be showing right now, from its ECS state. */
function currentAnimation(entity: RenderableEntity, data: UnitSpriteData) {
  const { type, team, action } = spriteStateOf(entity);
  const playback = data.manifest.actions[action];
  // An action that lacks frames for the unit's facing (say, an attack drawn
  // for north only) plays its nearest available facing instead.
  const facing = directionOf(entity.transform.rotation);
  const key = animationKey(
    type,
    team,
    action,
    playback ? playableDirection(playback, facing) : facing
  );
  const textures: Texture[] | undefined = data.animations[key];
  if (!textures || !playback) {
    // The loader checks every animation its manifest declares, so this is
    // a manifest that doesn't declare an action or team the unit can reach.
    throw new Error(`No "${key}" animation in the unit sprite data`);
  }
  return { key, action, textures, playback };
}

/**
 * Brings a sprite view's animation in line with its entity. A changed
 * animation key swaps the textures on the same sprite, applies the
 * manifest's fps and loop, and plays from frame 0 (or just shows frame 0
 * for a single-frame or zero-fps animation). An unchanged key leaves the
 * current playback alone — a walk cycle doesn't restart every frame —
 * except that a new attack swing restarts the attack. Non-looping
 * animations (attack, dead) stop on their last frame, so a corpse holds its
 * final `dead` frame until it's removed.
 *
 * Frames advance on Pixi's shared ticker (`AnimatedSprite` auto-update),
 * i.e. in real time.
 */
function syncAnimation(animation: SpriteAnimation, entity: RenderableEntity): void {
  const { key, action, textures, playback } = currentAnimation(entity, animation.data);
  const newSwing = action === 'attack' && entity.attackSwing !== animation.swing;
  animation.swing = entity.attackSwing;
  if (key === animation.key && !newSwing) {
    return;
  }

  const { sprite } = animation;
  // Turning to track a target mid-swing changes the key (it includes the
  // direction) but is still the same swing: carry on from the current frame
  // in the new direction's textures instead of restarting the attack.
  const keepFrame = action === 'attack' && !newSwing;
  const frame = Math.min(sprite.currentFrame, textures.length - 1);
  const wasPlaying = sprite.playing;
  sprite.textures = textures;
  sprite.animationSpeed = animationSpeed(playback.fps);
  sprite.loop = playback.loop;
  if (keepFrame && animation.key !== undefined) {
    if (wasPlaying) {
      sprite.gotoAndPlay(frame);
    } else {
      sprite.gotoAndStop(frame);
    }
  } else if (textures.length > 1 && playback.fps > 0) {
    sprite.gotoAndPlay(0);
  } else {
    sprite.gotoAndStop(0);
  }
  animation.key = key;
}

/**
 * Builds a sprite view's animated sprite at `scale`, already playing its
 * current animation.
 */
function createSpriteAnimation(
  entity: RenderableEntity,
  data: UnitSpriteData,
  scale: number
): SpriteAnimation {
  // Built on the current animation's frames (an `AnimatedSprite` can't be
  // empty), then left to `syncAnimation` to apply its speed and playback.
  const { textures } = currentAnimation(entity, data);
  const sprite = new AnimatedSprite({ textures, autoPlay: false });
  sprite.anchor.set(...data.manifest.anchor);
  sprite.scale.set(scale);
  const animation: SpriteAnimation = { sprite, data, swing: undefined };
  syncAnimation(animation, entity);
  return animation;
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
 *
 * Entities whose unit type is in `SPRITE_UNIT_TYPES` get a sprite view —
 * an animated sprite fitted to their footprint box (see
 * {@link spriteScale}), playing the animation derived from their ECS state
 * (`animationKeyOf`). A fired projectile gets a sprite view too, of its
 * `projectile.type`, showing the frame for the direction it travels and
 * drawn at its firer's scale (see {@link projectileSpriteScale}). Every
 * other entity gets a shape view: its primitive shape, turned to face
 * `Transform.rotation`. Both kinds share the same
 * selection marks, health bar and z-order (see `EntityView`). The sprite
 * textures belong to Pixi's `Assets` cache and are shared; views are only
 * ever destroyed with `{ children: true }`, never their textures.
 */
export class RenderSystem {
  private readonly query: Query<RenderableEntity>;
  private readonly views = new Map<RenderableEntity, EntityView>();

  private readonly handleAdded = (entity: RenderableEntity): void => {
    const container = new Container();
    container.zIndex =
      entity.health && entity.health.current <= 0 ? DEAD_Z_INDEX : ALIVE_Z_INDEX;

    const view: EntityView = { container };
    if (entity.projectile) {
      const data = this.spriteData(entity.projectile.type);
      const firer = this.spriteData(entity.projectile.sourceUnitType);
      view.animation = createSpriteAnimation(
        entity,
        data,
        projectileSpriteScale(entity.renderable, firer.manifest)
      );
      container.addChild(view.animation.sprite);
    } else if (isSpriteUnitType(entity.unitType)) {
      const data = this.spriteData(entity.unitType);
      view.animation = createSpriteAnimation(
        entity,
        data,
        spriteScale(entity.renderable, data.manifest)
      );
      container.addChild(view.animation.sprite);
    } else {
      const shape = new Container();
      shape.addChild(drawRenderable(entity.renderable));
      shape.addChild(drawFacingMark(entity.renderable.size));
      container.addChild(shape);
      view.shape = shape;
    }

    if (entity.selectable) {
      const selectionMarks = drawSelectionMarks(overlayExtent(entity.renderable));
      selectionMarks.visible = Boolean(entity.selected);
      container.addChild(selectionMarks);
      view.selectionMarks = selectionMarks;
    }
    if (entity.health) {
      const healthBar = createHealthBar(overlayExtent(entity.renderable));
      healthBar.container.visible = shouldShowHealthBar(
        entity as LivingRenderableEntity,
        this.healthBarsVisible
      );
      container.addChild(healthBar.container);
      drawHealthBarFill(healthBar.fill, entity.health, healthBar.width);
      view.healthBar = healthBar;

      if (view.shape) {
        const deathMark = new Graphics();
        drawDeathMark(deathMark, entity.renderable.size, entity.health.current <= 0);
        // Added to `shape`, not `container`: unlike the health bar and
        // selection marks (which stay screen-aligned on purpose), the death
        // mark reads as damage to the unit's own body — it should turn with
        // whichever way the unit was facing when it fell, not sit fixed
        // regardless of orientation.
        view.shape.addChild(deathMark);
        view.deathMark = deathMark;
      }

      this.lastHealth.set(entity as LivingRenderableEntity, entity.health.current);
    }

    // Container is itself a child of the parent, so destroying it (via
    // `destroy({ children: true })` in handleRemoved/dispose) destroys the
    // health bar's own container — and the graphics inside it — with it,
    // and a sprite view's sprite, but never the shared atlas textures that
    // sprite shows (that would take `texture: true`).
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

  /**
   * @param sprites Loaded sprite data for every `SPRITE_UNIT_TYPES` type
   *   (see `loadUnitSprites`).
   */
  constructor(
    query: Query<RenderableEntity>,
    private readonly parent: Container,
    healthBarsVisible = false,
    private readonly sprites: UnitSprites = new Map()
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
      if (view.healthBar && entity.health) {
        view.healthBar.container.visible = shouldShowHealthBar(
          entity as LivingRenderableEntity,
          visible
        );
      }
    }
  }

  /**
   * The loaded sprite data for a sprite unit type or projectile. Missing
   * data is a programming error (the caller didn't load or pass it in),
   * never a reason to quietly draw the entity as a shape instead.
   */
  private spriteData(unitType: UnitType): UnitSpriteData {
    const data = this.sprites.get(unitType);
    if (!data) {
      throw new Error(
        `RenderSystem has no sprite data for "${unitType}" units; ` +
          'load it with loadUnitSprites and pass it to the constructor'
      );
    }
    return data;
  }

  /** Number of views currently tracked — exposed for leak tests. */
  public get size(): number {
    return this.views.size;
  }

  /**
   * Copies each tracked entity's transform onto its view (turning a shape
   * view's shape to its rotation, or switching a sprite view's animation to
   * match its state — see `syncAnimation`), then — for entities
   * with a health bar — checks whether `health.current` has drifted from the
   * last HP drawn. A mismatch marks the entity's `renderable.dirty` so any
   * other system can observe it too, and redraws the bar's fill immediately.
   * An unchanged HP touches neither the flag nor the graphics: only dirty
   * entities redraw. Call once per frame.
   */
  public sync(): void {
    for (const [entity, view] of this.views) {
      view.container.position.set(entity.transform.position.x, entity.transform.position.y);
      if (view.shape) {
        view.shape.rotation = entity.transform.rotation;
      }
      if (view.animation) {
        syncAnimation(view.animation, entity);
      }

      if (view.selectionMarks) {
        view.selectionMarks.visible = Boolean(entity.selected);
      }

      if (entity.health) {
        markDirtyOnHealthChange(entity as LivingRenderableEntity, this.lastHealth);
        if (view.healthBar) {
          view.healthBar.container.visible = shouldShowHealthBar(
            entity as LivingRenderableEntity,
            this.healthBarsVisible
          );
        }
      }

      if (entity.renderable.dirty && view.healthBar && entity.health) {
        drawHealthBarFill(view.healthBar.fill, entity.health, view.healthBar.width);
        if (view.deathMark) {
          drawDeathMark(view.deathMark, entity.renderable.size, entity.health.current <= 0);
        }
        view.container.zIndex = entity.health.current <= 0 ? DEAD_Z_INDEX : ALIVE_Z_INDEX;
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
