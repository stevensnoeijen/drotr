import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries, type Queries } from '~/game/ecs/world';
import { markDirtyOnHealthChange } from '~/game/render/health-bar';
import type { Health, Renderable } from '~/game/ecs/components';
import { CELL_SIZE, cellCentreCoordinate, toWorldPositionCellCenter } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import { NO_CELL } from '~/game/navigation/occupancy-grid';
import { createCombatSystem } from './combat-system';

/** The fixed timestep the game loop runs systems at (60 Hz). */
const DT = 1 / 60;

interface UnitOptions {
  team: Entity['team'];
  /** World-space x; every unit sits on y = 0, so distance is |dx|. */
  x: number;
  health?: number;
  /** World-space y, snapped to its cell's centre like `x`. Defaults to 0. */
  y?: number;
  /** Attack reach in grid cells. Omit for a unit that cannot attack. */
  attackRangeCells?: number;
  damage?: number;
  /** Seconds between attacks. */
  attackCooldown?: number;
  /** World units/sec a fired projectile travels, if this unit is ranged. */
  projectileSpeed?: number;
}

/**
 * Ids must be distinct and defined: `findEntityById` matches on `id`, so a
 * world of id-less entities would resolve every `target.entityId` to the same
 * (first) entity and quietly pass tests that prove nothing.
 */
let nextId = 1;

function makeUnit(
  world: World<Entity>,
  {
    team,
    x,
    y = 0,
    health = 100,
    attackRangeCells,
    damage,
    attackCooldown,
    projectileSpeed,
  }: UnitOptions
): Entity {
  // Snapped to the cell centre, exactly as `spawnUnit` places a real unit —
  // and as `isSettled` now requires before a unit may fight at all.
  const position = toWorldPositionCellCenter(new Vector2(x, y));
  const entity: Entity = {
    id: nextId++,
    transform: { position: { x: position.x, y: position.y }, rotation: 0 },
    team,
    health: { current: health, max: health },
  };
  if (attackRangeCells !== undefined) {
    entity.attackRange = { value: attackRangeCells };
  }
  if (damage !== undefined) {
    entity.damage = { value: damage };
  }
  if (attackCooldown !== undefined) {
    entity.attackCooldown = { duration: attackCooldown };
  }
  if (projectileSpeed !== undefined) {
    entity.ranged = { projectileSpeed };
  }
  return world.add(entity);
}

/**
 * A one-sided fight: a blue attacker at the origin and a red dummy `gapCells`
 * away that never swings back, so every HP change observed is the attacker's.
 */
function setupDuel(options: {
  gapCells: number;
  attackRangeCells?: number;
  damage?: number;
  attackCooldown?: number;
  targetHealth?: number;
  /** Whether the attacker starts out targeting the dummy. Defaults to true. */
  targeted?: boolean;
}) {
  const {
    gapCells,
    attackRangeCells = 1,
    damage = 3,
    attackCooldown = 1,
    targetHealth = 100,
    targeted = true,
  } = options;

  const world = new World<Entity>();
  const queries = createQueries(world);

  const target = makeUnit(world, { team: 'red', x: gapCells * CELL_SIZE, health: targetHealth });
  const attacker = makeUnit(world, {
    team: 'blue',
    x: 0,
    attackRangeCells,
    damage,
    attackCooldown,
  });
  if (targeted) {
    attacker.target = { entityId: target.id! };
  }

  return { world, queries, attacker, target, system: createCombatSystem(queries) };
}

/** Runs `ticks` fixed steps of `system`. */
function run(
  system: ReturnType<typeof createCombatSystem>,
  world: World<Entity>,
  ticks: number,
  dt = DT
): void {
  for (let i = 0; i < ticks; i++) {
    system(world, dt);
  }
}

describe('CombatSystem', () => {
  it('lands an attack exactly once per attackCooldown, on the tick it elapses', () => {
    const { world, target, system } = setupDuel({ gapCells: 1, damage: 3, attackCooldown: 1 });

    // One second of simulated time, one tick at a time, recording which ticks
    // damage actually landed on.
    const hitTicks: number[] = [];
    let previous = target.health!.current;
    for (let tick = 1; tick <= 180; tick++) {
      system(world, DT);
      if (target.health!.current !== previous) {
        hitTicks.push(tick);
        previous = target.health!.current;
      }
    }

    // 60 ticks per second at 60 Hz, so exactly one hit per 60 ticks — never
    // two in the same second, and never a tick early.
    expect(hitTicks).toEqual([60, 120, 180]);
  });

  it('deals floor(N*dt / cooldown) * damage over N ticks', () => {
    const cooldown = 0.5;
    const damage = 4;

    for (const ticks of [0, 1, 29, 30, 31, 59, 60, 61, 137]) {
      const { world, target, system } = setupDuel({
        gapCells: 1,
        damage,
        attackCooldown: cooldown,
      });

      run(system, world, ticks);

      const expected = Math.floor((ticks * DT) / cooldown) * damage;
      expect(100 - target.health!.current, `after ${ticks} ticks`).toBe(expected);
    }
  });

  it('clamps HP at zero rather than letting it go negative', () => {
    const { world, target, system } = setupDuel({
      gapCells: 1,
      damage: 7,
      attackCooldown: 0.5,
      targetHealth: 10,
    });

    // Two hits (7, then 3 of the remaining 7) take it to exactly 0; keep
    // running well past that.
    run(system, world, 600);

    expect(target.health!.current).toBe(0);
  });

  it('deals no damage to a target beyond attack range', () => {
    const { world, target, attacker, system } = setupDuel({
      gapCells: 4,
      attackRangeCells: 1,
      attackCooldown: 0.5,
    });

    run(system, world, 600);

    expect(target.health!.current).toBe(100);
    // Still live and still chasing: the swing was skipped, not the target
    // dropped — SeekSystem is presumably still closing the distance.
    expect(attacker.target).toEqual({ entityId: target.id });
  });

  it('hits a target sitting exactly at the range boundary', () => {
    const { world, target, system } = setupDuel({
      gapCells: 2,
      attackRangeCells: 2,
      damage: 5,
      attackCooldown: 0.5,
    });

    run(system, world, 30);

    expect(target.health!.current).toBe(95);
  });

  it('still hits a target resting a floating-point hair off its cell centre', () => {
    // A unit is walked onto the exact centre of the cell it fights from, but
    // integration arithmetic can leave it a few ulps off it; without
    // `CELL_CENTRE_TOLERANCE`'s slack the two would stand nose to nose
    // forever, neither moving nor fighting.
    const { world, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    target.transform!.position.x = cellCentreCoordinate(1) + Number.EPSILON * CELL_SIZE * 4;

    run(system, world, 30);

    expect(target.health!.current).toBe(95);
  });

  it('does not swing while resting part-way across a cell', () => {
    const { world, attacker, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    // At rest, holding one cell, but stopped short of its centre — the
    // visible state the ticket is about. A swing from here would be a unit
    // fighting mid-cell however still it is standing.
    attacker.velocity = { x: 0, y: 0 };
    attacker.transform!.position.x -= 8;

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('does not swing at a target resting part-way across its own cell', () => {
    const { world, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    target.velocity = { x: 0, y: 0 };
    target.transform!.position.x += 8;

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('hits a target one cell diagonally away at attack range 1', () => {
    // A Euclidean range check would reject this: a diagonal neighbour is
    // `CELL_SIZE * sqrt(2)` away, further than one cell's width. Range is
    // measured in 8-way cell steps instead, so a diagonal neighbour counts
    // the same as an orthogonal one.
    const world = new World<Entity>();
    const queries = createQueries(world);
    const target = makeUnit(world, { team: 'red', x: CELL_SIZE, y: CELL_SIZE });
    const attacker = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.target = { entityId: target.id! };
    const system = createCombatSystem(queries);

    run(system, world, 30);

    expect(target.health!.current).toBe(95);
  });

  it('does not hit a target two cells diagonally away at attack range 1', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const target = makeUnit(world, { team: 'red', x: CELL_SIZE * 2, y: CELL_SIZE * 2 });
    const attacker = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.target = { entityId: target.id! };
    const system = createCombatSystem(queries);

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('withholds a swing while the attacker is still mid-step between two cells', () => {
    const { world, attacker, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.cellOccupancy = { occupantId: 0, cell: 0, reserved: 1, blockedFor: 0, rerouted: false };

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('withholds a swing while the target is still mid-step between two cells', () => {
    const { world, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    target.cellOccupancy = { occupantId: 1, cell: 1, reserved: 2, blockedFor: 0, rerouted: false };

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('withholds a swing while the attacker still has nonzero velocity, even with no active cell reservation', () => {
    const { world, attacker, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    // Occupancy proxy alone says "settled" (reserved cleared), but the unit
    // is still visibly sliding across ground it already owns — SeekSystem
    // hasn't yet decided to stop chasing and zero this.
    attacker.cellOccupancy = { occupantId: 0, cell: 0, reserved: NO_CELL, blockedFor: 0, rerouted: false };
    attacker.velocity = { x: 12, y: 0 };

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('withholds a swing while the target still has nonzero velocity, even with no active cell reservation', () => {
    const { world, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    target.cellOccupancy = { occupantId: 1, cell: 1, reserved: NO_CELL, blockedFor: 0, rerouted: false };
    target.velocity = { x: -12, y: 0 };

    run(system, world, 30);

    expect(target.health!.current).toBe(100);
  });

  it('resumes swinging once velocity settles back to zero', () => {
    const { world, attacker, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.velocity = { x: 12, y: 0 };

    run(system, world, 30);
    expect(target.health!.current).toBe(100);

    attacker.velocity = { x: 0, y: 0 };
    run(system, world, 30);

    expect(target.health!.current).toBe(95);
  });

  it('resumes swinging once both combatants settle back into a single cell', () => {
    const { world, attacker, target, system } = setupDuel({
      gapCells: 1,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.cellOccupancy = { occupantId: 0, cell: 0, reserved: 1, blockedFor: 0, rerouted: false };

    run(system, world, 30);
    expect(target.health!.current).toBe(100);

    attacker.cellOccupancy!.reserved = NO_CELL;
    run(system, world, 30);

    expect(target.health!.current).toBe(95);
  });

  it('does not attack a target that died since the last perception scan, and clears it', () => {
    const { world, target, attacker, system } = setupDuel({
      gapCells: 1,
      damage: 3,
      attackCooldown: 1,
    });

    // Killed by someone else partway through the attacker's recovery — no
    // perception scan has run since, so the stale target is still set.
    run(system, world, 30);
    expect(target.health!.current).toBe(100);
    target.health!.current = 0;

    // Carry on past the tick the swing would have landed on.
    run(system, world, 90);

    expect(target.health!.current).toBe(0);
    expect(attacker.target).toBeUndefined();
  });

  it('clears a target that has been removed from the world entirely', () => {
    const { world, target, attacker, system } = setupDuel({ gapCells: 1, attackCooldown: 1 });

    world.remove(target);
    run(system, world, 60);

    expect(attacker.target).toBeUndefined();
  });

  it('does not swing while the attacker itself is dead', () => {
    const { world, target, attacker, system } = setupDuel({
      gapCells: 1,
      damage: 3,
      attackCooldown: 1,
    });

    attacker.health!.current = 0;
    run(system, world, 600);

    expect(target.health!.current).toBe(100);
  });

  it('freezes a dead attacker\'s cooldown instead of banking it', () => {
    const { world, target, attacker, system } = setupDuel({
      gapCells: 1,
      damage: 3,
      attackCooldown: 1,
    });

    // Dead for five seconds, then revived: the recovery it sat out must not
    // come back as a burst of banked swings.
    attacker.health!.current = 0;
    run(system, world, 300);
    attacker.health!.current = 100;
    run(system, world, 59);

    expect(target.health!.current).toBe(100);

    run(system, world, 1);
    expect(target.health!.current).toBe(97);
  });

  it('does nothing for a unit with no target', () => {
    const { world, target, system } = setupDuel({
      gapCells: 1,
      attackCooldown: 0.5,
      targeted: false,
    });

    run(system, world, 600);

    expect(target.health!.current).toBe(100);
  });

  it('never lets a cooldown gap be shortened by dropping and re-acquiring a target', () => {
    const { world, target, attacker, system } = setupDuel({
      gapCells: 1,
      damage: 3,
      attackCooldown: 1,
    });

    // Lose and immediately regain the target, repeatedly, right up to the
    // tick before the swing is due.
    for (let tick = 1; tick <= 59; tick++) {
      delete attacker.target;
      system(world, DT);
      attacker.target = { entityId: target.id! };
    }
    expect(target.health!.current).toBe(100);

    system(world, DT);
    expect(target.health!.current).toBe(97);
  });

  it('excludes a unit missing any combat stat from attacking at all', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries);

    const victim = makeUnit(world, { team: 'red', x: CELL_SIZE });
    // Has range and damage, but no cooldown: nothing schedules its swings.
    const halfEquipped = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 1,
      damage: 50,
    });
    halfEquipped.target = { entityId: victim.id! };

    expect(queries.attackers.size).toBe(0);
    run(system, world, 600);

    expect(victim.health!.current).toBe(100);
  });

  it('lets both sides of a duel trade blows on their own schedules', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries);

    const blue = makeUnit(world, {
      team: 'blue',
      x: 0,
      health: 20,
      attackRangeCells: 1,
      damage: 3,
      attackCooldown: 1,
    });
    const red = makeUnit(world, {
      team: 'red',
      x: CELL_SIZE,
      health: 20,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 2,
    });
    blue.target = { entityId: red.id! };
    red.target = { entityId: blue.id! };

    // Three seconds: blue swings at t=1,2,3; red at t=2.
    run(system, world, 180);

    expect(red.health!.current).toBe(20 - 3 * 3);
    expect(blue.health!.current).toBe(20 - 5 * 1);
  });

  it('marks the health bar dirty on every damage application', () => {
    const { world, target, system } = setupDuel({
      gapCells: 1,
      damage: 3,
      attackCooldown: 1,
    });

    // The renderer's own dirty-flag path (T1.5), driven straight off
    // `health.current` — no Pixi involved.
    const renderable: Renderable = { shape: 'square', color: 0x66ccff, size: 13 };
    target.renderable = renderable;
    const tracked = target as { renderable: Renderable; health: Health };
    const lastHealth = new Map<typeof tracked, number>();
    markDirtyOnHealthChange(tracked, lastHealth);
    renderable.dirty = false;

    const dirtyTicks: number[] = [];
    for (let tick = 1; tick <= 180; tick++) {
      system(world, DT);
      markDirtyOnHealthChange(tracked, lastHealth);
      if (renderable.dirty) {
        dirtyTicks.push(tick);
        // Stand in for the renderer, which clears the flag once it redraws.
        renderable.dirty = false;
      }
    }

    expect(dirtyTicks).toEqual([60, 120, 180]);
  });
});

describe('CombatSystem ranged attacks', () => {
  it('fires a travelling projectile instead of dealing instant damage on a landed swing', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries);

    const target = makeUnit(world, { team: 'red', x: 3 * CELL_SIZE });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 1,
      projectileSpeed: 10 * CELL_SIZE,
    });
    crossbowman.target = { entityId: target.id! };

    // One cooldown elapses: the swing lands (well within the 5-cell range),
    // but no damage is applied directly.
    run(system, world, 60);

    expect(target.health!.current).toBe(100);
    expect(queries.projectiles.size).toBe(1);

    const [projectile] = [...queries.projectiles];
    expect(projectile.projectile.targetId).toBe(target.id);
    expect(projectile.projectile.sourceTeam).toBe('blue');
    expect(projectile.damage.value).toBe(2);
  });

  it('does not fire at a target beyond its 5-cell attack range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries);

    const target = makeUnit(world, { team: 'red', x: 6 * CELL_SIZE });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 0.5,
      projectileSpeed: 10 * CELL_SIZE,
    });
    crossbowman.target = { entityId: target.id! };

    run(system, world, 600);

    expect(queries.projectiles.size).toBe(0);
    expect(target.health!.current).toBe(100);
  });
});

describe('attackers query', () => {
  it('matches only fully combat-statted units', () => {
    const world = new World<Entity>();
    const queries: Queries = createQueries(world);

    const armed = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 1,
      damage: 3,
      attackCooldown: 1,
    });
    // Targetable, but has no combat stats of its own.
    makeUnit(world, { team: 'red', x: CELL_SIZE });

    expect([...queries.attackers]).toEqual([armed]);
    expect(queries.combatants.size).toBe(2);
  });
});
