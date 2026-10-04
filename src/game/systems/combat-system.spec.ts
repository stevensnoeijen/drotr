import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries, type Queries } from '~/game/ecs/world';
import { markDirtyOnHealthChange } from '~/game/render/health-bar';
import type { Health, Renderable } from '~/game/ecs/components';
import { DEFAULT_CELL_SIZE, cellCentreCoordinate, toWorldPositionCellCenter } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import { NO_CELL } from '~/game/navigation/occupancy-grid';
import { MAX_SWING_SECONDS, cellDistance, createCombatSystem, isSettled } from './combat-system';

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
  /** Seconds into the swing a ranged unit fires. Defaults to 0. */
  releaseTime?: number;
}

/**
 * Ids must be distinct and defined: `findEntityById` matches on `id`, so a
 * world of id-less entities would resolve every `target.entityId` to the same
 * (first) entity and quietly pass tests that prove nothing.
 */
let nextId = 1;

/**
 * What makes a unit a crossbow soldier for `fireProjectile`: its `Ranged`,
 * plus the `unitType` and `renderable` `spawnUnit` gives every unit, which
 * the fired bolt is drawn to scale against.
 */
function crossbow(
  projectileSpeed: number,
  releaseTime = 0
): Pick<Entity, 'ranged' | 'unitType' | 'renderable'> {
  return {
    ranged: { projectileSpeed, projectile: 'bolt', releaseTime },
    unitType: 'crossbowsoldier',
    renderable: { shape: 'triangle', color: 0x66ccff, size: 6, extent: 8 },
  };
}

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
    releaseTime,
  }: UnitOptions
): Entity {
  // Snapped to the cell centre, exactly as `spawnUnit` places a real unit —
  // and as `isSettled` now requires before a unit may fight at all.
  const position = toWorldPositionCellCenter(new Vector2(x, y), DEFAULT_CELL_SIZE);
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
    Object.assign(entity, crossbow(projectileSpeed, releaseTime));
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

  const target = makeUnit(world, { team: 'red', x: gapCells * DEFAULT_CELL_SIZE, health: targetHealth });
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

  return { world, queries, attacker, target, system: createCombatSystem(queries, DEFAULT_CELL_SIZE) };
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
    target.transform!.position.x = cellCentreCoordinate(1, DEFAULT_CELL_SIZE) + Number.EPSILON * DEFAULT_CELL_SIZE * 4;

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
    // `DEFAULT_CELL_SIZE * sqrt(2)` away, further than one cell's width. Range is
    // measured in 8-way cell steps instead, so a diagonal neighbour counts
    // the same as an orthogonal one.
    const world = new World<Entity>();
    const queries = createQueries(world);
    const target = makeUnit(world, { team: 'red', x: DEFAULT_CELL_SIZE, y: DEFAULT_CELL_SIZE });
    const attacker = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.target = { entityId: target.id! };
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);

    run(system, world, 30);

    expect(target.health!.current).toBe(95);
  });

  it('does not hit a target two cells diagonally away at attack range 1', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const target = makeUnit(world, { team: 'red', x: DEFAULT_CELL_SIZE * 2, y: DEFAULT_CELL_SIZE * 2 });
    const attacker = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 1,
      damage: 5,
      attackCooldown: 0.5,
    });
    attacker.target = { entityId: target.id! };
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);

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
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);

    const victim = makeUnit(world, { team: 'red', x: DEFAULT_CELL_SIZE });
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
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);

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
      x: DEFAULT_CELL_SIZE,
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

  describe('attack swing flag', () => {
    it('flags a swing on the tick the cooldown elapses and clears it afterwards', () => {
      const { world, attacker, system } = setupDuel({ gapCells: 1, attackCooldown: 1 });

      run(system, world, 59);
      expect(attacker.attackSwing).toBeUndefined();

      run(system, world, 1);
      expect(attacker.attackSwing).toEqual({ elapsed: 0 });

      // Cleared once MAX_SWING_SECONDS has passed, well before the next swing.
      run(system, world, Math.ceil(MAX_SWING_SECONDS / DT) + 1);
      expect(attacker.attackSwing).toBeUndefined();
    });

    it('never outlasts a cooldown shorter than the maximum swing length', () => {
      const { world, attacker, system } = setupDuel({ gapCells: 1, attackCooldown: 0.25 });

      run(system, world, Math.round(0.25 / DT));
      expect(attacker.attackSwing).toBeDefined();
      // Restarted by the next swing rather than left running over it.
      run(system, world, Math.round(0.25 / DT));
      expect(attacker.attackSwing).toEqual({ elapsed: 0 });
    });

    it('does not flag a swing that is not taken (target out of range)', () => {
      const { world, attacker, system } = setupDuel({ gapCells: 5, attackRangeCells: 1 });

      run(system, world, 180);
      expect(attacker.attackSwing).toBeUndefined();
    });

    it('flags a swing for a ranged attacker when it fires', () => {
      const { world, attacker, system } = setupDuel({ gapCells: 3, attackRangeCells: 5 });
      Object.assign(attacker, crossbow(100));

      run(system, world, 60);
      expect(attacker.attackSwing).toBeDefined();
    });
  });
});

describe('CombatSystem ranged attacks', () => {
  it('fires a travelling projectile instead of dealing instant damage on a landed swing', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);

    const target = makeUnit(world, { team: 'red', x: 3 * DEFAULT_CELL_SIZE });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 1,
      projectileSpeed: 10 * DEFAULT_CELL_SIZE,
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

  function setupShooter() {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);
    const target = makeUnit(world, { team: 'red', x: 3 * DEFAULT_CELL_SIZE });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 1,
      projectileSpeed: 10 * DEFAULT_CELL_SIZE,
    });
    crossbowman.target = { entityId: target.id! };
    return { world, queries, system, target, crossbowman };
  }

  it('fires at a target that is walking (nonzero velocity, mid-transit)', () => {
    const { world, queries, system, target } = setupShooter();
    target.cellOccupancy = { occupantId: 1, cell: 1, reserved: 2, blockedFor: 0, rerouted: false };
    target.velocity = { x: 80, y: 0 };

    run(system, world, 60);

    expect(queries.projectiles.size).toBe(1);
  });

  it('still withholds a shot while the shooter itself is moving', () => {
    const { world, queries, system, crossbowman } = setupShooter();
    crossbowman.velocity = { x: 80, y: 0 };

    run(system, world, 120);

    expect(queries.projectiles.size).toBe(0);
  });

  it('still does not fire at a moving target beyond attack range', () => {
    const { world, queries, system, target } = setupShooter();
    target.transform!.position.x = 20 * DEFAULT_CELL_SIZE;
    target.velocity = { x: 80, y: 0 };

    run(system, world, 120);

    expect(queries.projectiles.size).toBe(0);
  });

  it('does not fire at a target beyond its 5-cell attack range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);

    const target = makeUnit(world, { team: 'red', x: 6 * DEFAULT_CELL_SIZE });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 0.5,
      projectileSpeed: 10 * DEFAULT_CELL_SIZE,
    });
    crossbowman.target = { entityId: target.id! };

    run(system, world, 600);

    expect(queries.projectiles.size).toBe(0);
    expect(target.health!.current).toBe(100);
  });
});

describe('CombatSystem ranged release timing', () => {
  const RELEASE = 0.125;

  function setupRelease() {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);
    const target = makeUnit(world, { team: 'red', x: 3 * DEFAULT_CELL_SIZE });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 1.5,
      projectileSpeed: 10 * DEFAULT_CELL_SIZE,
      releaseTime: RELEASE,
    });
    crossbowman.target = { entityId: target.id! };
    return { world, queries, system, target, crossbowman };
  }

  /** Runs to the tick the 1.5 s cooldown elapses, so the swing has just started. */
  function runToSwingStart(system: ReturnType<typeof createCombatSystem>, world: World<Entity>) {
    run(system, world, 90);
  }

  it('starts the swing without firing in the same tick', () => {
    const { world, queries, system, crossbowman } = setupRelease();

    runToSwingStart(system, world);

    expect(crossbowman.attackSwing).toBeDefined();
    expect(queries.projectiles.size).toBe(0);
  });

  it('fires exactly one projectile once the release time has passed', () => {
    const { world, queries, system } = setupRelease();

    runToSwingStart(system, world);
    run(system, world, 7);
    expect(queries.projectiles.size).toBe(0);
    run(system, world, 1);
    expect(queries.projectiles.size).toBe(1);
  });

  it('does not fire a second bolt from the same swing', () => {
    const { world, queries, system } = setupRelease();

    runToSwingStart(system, world);
    run(system, world, 20);

    expect(queries.projectiles.size).toBe(1);
  });

  it('fires nothing and clears the swing when the target dies during the wind-up', () => {
    const { world, queries, system, target, crossbowman } = setupRelease();

    runToSwingStart(system, world);
    target.health!.current = 0;
    run(system, world, 10);

    expect(queries.projectiles.size).toBe(0);
    expect(crossbowman.attackSwing).toBeUndefined();
    expect(crossbowman.target).toBeUndefined();
  });

  it('fires nothing when the target is removed during the wind-up', () => {
    const { world, queries, system, target, crossbowman } = setupRelease();

    runToSwingStart(system, world);
    world.remove(target);
    run(system, world, 10);

    expect(queries.projectiles.size).toBe(0);
    expect(crossbowman.attackSwing).toBeUndefined();
  });

  it('still fires when the target leaves range during the wind-up', () => {
    const { world, queries, system, target } = setupRelease();

    runToSwingStart(system, world);
    target.transform!.position.x = 30 * DEFAULT_CELL_SIZE;
    run(system, world, 10);

    expect(queries.projectiles.size).toBe(1);
  });

  it('still fires when the attacker starts moving during the wind-up', () => {
    const { world, queries, system, crossbowman } = setupRelease();

    runToSwingStart(system, world);
    crossbowman.velocity = { x: 80, y: 0 };
    run(system, world, 10);

    expect(queries.projectiles.size).toBe(1);
  });

  it('fires nothing when the attacker dies during the wind-up', () => {
    const { world, queries, system, crossbowman } = setupRelease();

    runToSwingStart(system, world);
    crossbowman.health!.current = 0;
    run(system, world, 10);

    expect(queries.projectiles.size).toBe(0);
  });

  it('keeps shots one cooldown apart', () => {
    const { world, queries, system } = setupRelease();

    runToSwingStart(system, world);
    run(system, world, 10);
    expect(queries.projectiles.size).toBe(1);
    // Second swing starts 1.5 s after the first, and fires 0.125 s later.
    run(system, world, 85);
    expect(queries.projectiles.size).toBe(1);
    run(system, world, 10);
    expect(queries.projectiles.size).toBe(2);
  });

  it('still damages a melee target at swing start', () => {
    const { world, attacker, target, system } = setupDuel({ gapCells: 1, damage: 3 });

    run(system, world, 60);

    expect(attacker.attackSwing?.pendingTargetId).toBeUndefined();
    expect(target.health!.current).toBe(97);
  });
});

describe('CombatSystem looping ranged attack', () => {
  it('fires one bolt per cycle and never drops the swing between shots', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createCombatSystem(queries, DEFAULT_CELL_SIZE);
    const target = makeUnit(world, { team: 'red', x: 3 * DEFAULT_CELL_SIZE, health: 1000 });
    const crossbowman = makeUnit(world, {
      team: 'blue',
      x: 0,
      attackRangeCells: 5,
      damage: 2,
      attackCooldown: 0.5,
      projectileSpeed: 1,
      releaseTime: 0.125,
    });
    crossbowman.target = { entityId: target.id! };

    // The first swing starts when the first cooldown elapses (0.5 s).
    run(system, world, 30);
    expect(crossbowman.attackSwing).toBeDefined();

    // From there the swing is flagged on every tick, across 9 more cycles,
    // and each cycle releases exactly one bolt.
    let previous = crossbowman.attackSwing;
    let restarts = 0;
    for (let tick = 0; tick < 295; tick++) {
      run(system, world, 1);
      expect(crossbowman.attackSwing).toBeDefined();
      if (crossbowman.attackSwing !== previous) {
        restarts++;
        previous = crossbowman.attackSwing;
      }
    }
    expect(restarts).toBe(9);
    // Swings start every 0.5 s from 0.5 s to 5.0 s and release 0.125 s in.
    expect(queries.projectiles.size).toBe(10);
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
    makeUnit(world, { team: 'red', x: DEFAULT_CELL_SIZE });

    expect([...queries.attackers]).toEqual([armed]);
    expect(queries.combatants.size).toBe(2);
  });
});

describe('cell geometry at a cell size other than the default', () => {
  // A 40px cell: range and "settled" are judged in cells of whatever size
  // the grid uses.
  const cellSize = 40;

  it('counts cell steps between the 40px cells two points fall in', () => {
    // 78px apart along x: two 32px cells, but only one 40px cell.
    expect(cellDistance({ x: 1, y: 1 }, { x: 79, y: 1 }, 32)).toBe(2);
    expect(cellDistance({ x: 1, y: 1 }, { x: 79, y: 1 }, cellSize)).toBe(1);
  });

  it('only counts a unit settled on the centre of a 40px cell', () => {
    expect(isSettled({ transform: { position: { x: 60, y: 20 }, rotation: 0 } }, cellSize)).toBe(
      true
    );
    // The centre of a 32px cell is part-way across a 40px one.
    expect(isSettled({ transform: { position: { x: 48, y: 16 }, rotation: 0 } }, cellSize)).toBe(
      false
    );
  });
});
