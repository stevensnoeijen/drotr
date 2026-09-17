import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { CELL_SIZE } from '~/lib/grid';
import { createSeekSystem, PURSUIT_REPATH_INTERVAL } from './seek-system';

describe('createSeekSystem', () => {
  it('sets velocity toward the target, scaled to moveSpeed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 100, y: 0 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 1 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 10, y: 0 });
  });

  it('points velocity diagonally toward a target off-axis', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 30, y: 40 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 5 },
      attackRange: { value: 0 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    // Distance is 50 (3-4-5 triangle), so unit vector is (0.6, 0.8).
    expect(self.velocity.x).toBeCloseTo(3);
    expect(self.velocity.y).toBeCloseTo(4);
  });

  it('zeroes velocity once within attackRange of the target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 1.5 * CELL_SIZE, y: 0 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 5, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 2 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
  });

  it('zeroes velocity exactly at the attackRange boundary (no overshoot)', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 2 * CELL_SIZE, y: 0 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 5, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 2 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
  });

  it('faces the target once stopped at attackRange, even though velocity is zero', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 0, y: 1.5 * CELL_SIZE }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 2 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
    expect(self.transform.rotation).toBeCloseTo(Math.PI);
  });

  it('quantizes the facing set while stopped at range to the nearest of 8 directions (#178)', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    // Shallow, off-diagonal offset from self to target.
    const target = world.add({
      transform: { position: { x: 10 * CELL_SIZE, y: -1 * CELL_SIZE }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 20 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    // Snapped to due east rather than the raw shallow atan2 angle.
    expect(self.transform.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('leaves velocity untouched for an entity with no target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 3, y: 4 },
      moveSpeed: { value: 10 },
      attackRange: { value: 1 },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 3, y: 4 });
  });

  it('leaves velocity untouched when the target no longer resolves to an entity', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 3, y: 4 },
      moveSpeed: { value: 10 },
      attackRange: { value: 1 },
      target: { entityId: 9999 },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 3, y: 4 });
  });

  describe('routing around walls (#195)', () => {
    /** A collision grid in the exact shape a loaded map exposes. */
    const gridFrom = (art: string) => {
      const rows = art
        .trim()
        .split('\n')
        .map((line) => [...line.trim()]);
      const width = rows[0].length;
      const collision = new Uint8Array(width * rows.length);
      rows.forEach((row, y) =>
        row.forEach((cell, x) => {
          collision[y * width + x] = cell === '#' ? 1 : 0;
        })
      );

      return { width, height: rows.length, collision };
    };

    const centre = (col: number, row: number) => ({
      x: col * CELL_SIZE + CELL_SIZE / 2,
      y: row * CELL_SIZE + CELL_SIZE / 2,
    });

    /** A wall down column 2, open along the bottom row. */
    const wallWithGap = gridFrom(`
      ..#..
      ..#..
      ..#..
      ..#..
      .....
    `);

    const openGround = gridFrom(`
      .....
      .....
      .....
      .....
      .....
    `);

    /**
     * `self` on the west side of the wall, an enemy directly east of it on
     * the far side — straight-line unreachable, routable along the bottom.
     */
    function setup(grid: ReturnType<typeof gridFrom> | undefined, selfCell = centre(0, 0)) {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const system = createSeekSystem(queries, grid);

      const enemy = world.add({
        id: 1,
        transform: { position: { ...centre(4, 0) }, rotation: 0 },
        team: 'red' as const,
        health: { current: 10, max: 10 },
      });
      const self = world.add({
        id: 2,
        transform: { position: { ...selfCell }, rotation: 0 },
        velocity: { x: 0, y: 0 },
        moveSpeed: { value: CELL_SIZE },
        attackRange: { value: 1 },
        team: 'blue' as const,
        health: { current: 10, max: 10 },
        target: { entityId: 1 },
      });

      return { world, queries, system, self, enemy };
    }

    it('routes a blocked target through the gap instead of steering into the wall', () => {
      const { world, system, self } = setup(wallWithGap);

      system(world, 1 / 60);

      expect(self.pursuit).toEqual({
        entityId: 1,
        plannedPosition: centre(4, 0),
        sinceReplan: 0,
      });
      // Down the west side, along the open bottom row, then back up — never
      // straight at the target through column 2.
      expect(self.movePath?.waypoints).toEqual([
        centre(1, 1),
        centre(1, 2),
        centre(1, 3),
        centre(1, 4),
        centre(2, 4),
        centre(3, 4),
        centre(4, 3),
        centre(4, 2),
        centre(4, 1),
        centre(4, 0),
      ]);
      // Velocity is MoveTargetSystem's to write, once MovePathSystem hands
      // over the first leg later in the same fixed step.
      expect(self.velocity).toEqual({ x: 0, y: 0 });
    });

    it('steers straight at a target it has a clear line to, planning no route', () => {
      const { world, system, self } = setup(openGround);

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity.x).toBeCloseTo(CELL_SIZE);
      expect(self.velocity.y).toBeCloseTo(0);
    });

    it('is straight-line only with no grid at all, exactly as before', () => {
      const { world, system, self } = setup(undefined);

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity.x).toBeCloseTo(CELL_SIZE);
    });

    it('keeps walking an in-flight route rather than replanning every tick', () => {
      const { world, system, self } = setup(wallWithGap);

      system(world, 1 / 60);
      const planned = self.movePath;
      // Simulate MovePathSystem taking the first leg.
      self.movePath!.index = 1;
      self.moveTarget = { position: { ...centre(1, 1) } };

      system(world, 1 / 60);

      expect(self.movePath).toBe(planned);
      expect(self.movePath?.index).toBe(1);
      expect(self.moveTarget).toEqual({ position: centre(1, 1) });
    });

    it('replans immediately when the target switches, dropping the old route', () => {
      const { world, system, self } = setup(wallWithGap);

      system(world, 1 / 60);
      const towardFirst = self.movePath?.waypoints;

      // A second enemy, south of the wall's far side, picked up by a later
      // perception scan while the first route was still in flight.
      world.add({
        id: 3,
        transform: { position: { ...centre(4, 3) }, rotation: 0 },
        team: 'red' as const,
        health: { current: 10, max: 10 },
      });
      self.target = { entityId: 3 };

      // Well inside the replan throttle: a target switch must not wait it out.
      system(world, 1 / 60);

      expect(self.pursuit?.entityId).toBe(3);
      expect(self.movePath?.waypoints).not.toEqual(towardFirst);
      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(4, 3));
      expect(self.movePath?.index).toBe(0);
    });

    it('replans once a still-unseen target has drifted a cell from where the route was planned', () => {
      const { world, system, self, enemy } = setup(wallWithGap);

      system(world, 1 / 60);
      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(4, 0));

      // Still behind the wall, but a good way down it.
      enemy.transform!.position = { ...centre(4, 3) };
      system(world, PURSUIT_REPATH_INTERVAL);

      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(4, 3));
      expect(self.pursuit?.plannedPosition).toEqual(centre(4, 3));
      expect(self.pursuit?.sinceReplan).toBe(0);
    });

    it('does not replan for a drifting target until the throttle interval has elapsed', () => {
      const { world, system, self, enemy } = setup(wallWithGap);

      system(world, 1 / 60);
      enemy.transform!.position = { ...centre(4, 3) };

      // Well short of PURSUIT_REPATH_INTERVAL: the stale route stands.
      system(world, 1 / 60);

      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(4, 0));
      expect(self.pursuit?.plannedPosition).toEqual(centre(4, 0));
    });

    it('holds position when the target is walled off with no route at all', () => {
      const divided = gridFrom(`
        ..#..
        ..#..
        ..#..
        ..#..
        ..#..
      `);
      const { world, system, self } = setup(divided);
      self.velocity.x = 99;

      system(world, 1 / 60);

      expect(self.movePath).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
      // A pursuit is still recorded, so the search is retried on the throttle
      // rather than every tick.
      expect(self.pursuit?.entityId).toBe(1);
    });

    it('abandons the route and closes in a straight line once the target comes into sight', () => {
      const { world, system, self, enemy } = setup(wallWithGap);

      system(world, 1 / 60);
      expect(self.movePath).toBeDefined();

      // The enemy walks around to the open side, in plain view.
      enemy.transform!.position = { ...centre(0, 3) };

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.moveTarget).toBeUndefined();
      expect(self.velocity.x).toBeCloseTo(0);
      expect(self.velocity.y).toBeCloseTo(CELL_SIZE);
    });

    it('abandons the route and stops when the target dies mid-pursuit', () => {
      const { world, system, self, enemy } = setup(wallWithGap);

      system(world, 1 / 60);
      self.velocity.x = 99;

      enemy.health!.current = 0;
      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
    });

    it('abandons the route and stops when the target is cleared outright', () => {
      const { world, system, self } = setup(wallWithGap);

      system(world, 1 / 60);
      self.velocity.x = 99;

      // Cast: what `DeathCleanupSystem` does to a dangling reference, on an
      // entity whose literal type happens to have made `target` required.
      delete (self as Entity).target;
      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
    });

    it('leaves a unit under a player move order entirely alone', () => {
      const { world, system, self } = setup(wallWithGap);
      self.moveTarget = { position: { x: 999, y: 999 } };
      self.movePath = { waypoints: [{ x: 999, y: 999 }], index: 0 };
      self.velocity.x = 7;

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toEqual({ waypoints: [{ x: 999, y: 999 }], index: 0 });
      expect(self.moveTarget).toEqual({ position: { x: 999, y: 999 } });
      expect(self.velocity.x).toBe(7);
    });

    it('leaves a unit with a staged player move order alone too', () => {
      const { world, system, self } = setup(wallWithGap);
      self.pendingMoveOrder = { destination: { x: 999, y: 999 } };
      self.velocity.x = 7;

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity.x).toBe(7);
    });

    it('stops and faces a target already within attack range instead of routing around the wall', () => {
      // Diagonally across the wall's corner: within one cell of reach, but
      // with no line of sight to it.
      const { world, system, self } = setup(wallWithGap, centre(1, 0));
      self.attackRange!.value = 4;

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
      expect(self.transform.rotation).toBeCloseTo(Math.PI / 2);
    });
  });
});
