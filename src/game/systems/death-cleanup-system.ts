import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';

/**
 * Clears any `Target` reference left pointing at an entity once it actually
 * leaves the world (i.e. `world.remove`, called by `DeathSystem` once a
 * corpse's removal delay elapses).
 *
 * Mirrors `RenderSystem`'s `onEntityAdded`/`onEntityRemoved` subscription
 * pattern — one reactive hook here, run once per removal, rather than having
 * every system that might hold a `Target` (`PerceptionSystem`,
 * `CombatSystem`, and any future one) separately check whether it's stale.
 * `world.onEntityRemoved` (not an archetype query's) is used deliberately:
 * the reference needs clearing no matter what components the removed entity
 * itself had.
 *
 * Scans `world.entities` directly rather than an archetype query keyed on
 * `target`: `PerceptionSystem`/`CombatSystem` set and clear `Target` via
 * plain field assignment (`self.target = {...}` / `delete self.target`), not
 * `world.addComponent`/`removeComponent`, so a query requiring `target`
 * would never actually reindex to pick those entities up. A full scan has no
 * such dependency, and is cheap at this codebase's unit-count scale (the
 * same tradeoff `PerceptionSystem`'s own O(n²) scan already makes).
 *
 * Selection needs no equivalent handling here: `Selected` lives as a
 * component on the removed entity itself, not a reference held by anyone
 * else. It's dropped even earlier than removal, though — `DeathSystem`
 * clears it the instant the unit dies (#197), rather than leaving a
 * selected corpse sitting in `queries.selected` for its whole removal
 * delay.
 *
 * Also removes any purely visual attachment (`AttachedTo`, #161 — e.g. the
 * crossbow unit's projectile stripe) whose parent was the removed entity, so
 * a dead unit's corpse being swept up doesn't leave its projectile orphaned
 * in the world (and its Pixi view leaked) with nothing left to follow.
 */
export class DeathCleanupSystem {
  private readonly handleRemoved = (removed: Entity): void => {
    const removedId = removed.id;
    if (removedId === undefined) {
      return;
    }
    // Snapshotted defensively even though `delete entity.target` doesn't
    // itself remove `entity` from `world.entities` (only from any query
    // keyed on `target`, or, for an attachment, `world.remove` below):
    // consistent with every other removal-during-iteration guard in this
    // codebase (e.g. `DeathSystem`'s own `dead` sweep).
    for (const entity of [...this.world.entities]) {
      if (entity.target?.entityId === removedId) {
        delete entity.target;
      }
      if (entity.attachedTo?.entityId === removedId) {
        this.world.remove(entity);
      }
    }
  };

  constructor(private readonly world: World<Entity>) {
    this.world.onEntityRemoved.subscribe(this.handleRemoved);
  }

  /** Unsubscribes from the world. Call on teardown to avoid a stale handler. */
  public dispose(): void {
    this.world.onEntityRemoved.unsubscribe(this.handleRemoved);
  }
}
