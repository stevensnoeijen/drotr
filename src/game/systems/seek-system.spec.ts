import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { OccupancyGrid } from '~/game/navigation/occupancy-grid';
import { CELL_SIZE, cellCentreCoordinate } from '~/lib/grid';
import { createSeekSystem, PURSUIT_REPATH_INTERVAL } from './seek-system';

const centre = (col: number, row: number) => ({
  x: cellCentreCoordinate(col, CELL_SIZE),
  y: cellCentreCoordinate(row, CELL_SIZE),
});

/** A collision grid in the exact shape a loaded map exposes. */
function gridFrom(art: string) {
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
}

describe('createSeekSystem', () => {
  describe('walking to a cell it can attack from', () => {
    /**
     * `self` standing on the centre of cell (0, 0), a target `range` cells
     * away to the east. No grid at all, so everything is in sight and every
     * cell is free — the plainest possible case.
     */
    function setup(targetCell = centre(10, 0), range = 1, selfCell = centre(0, 0)) {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const system = createSeekSystem(queries);

      const target = world.add({
        id: 1,
        transform: { position: { ...targetCell }, rotation: 0 },
      });
      const self = world.add({
        id: 2,
        transform: { position: { ...selfCell }, rotation: 0 },
        velocity: { x: 0, y: 0 },
        moveSpeed: { value: 10 },
        attackRange: { value: range },
        target: { entityId: target.id! },
      });

      return { world, system, self, target };
    }

    it('heads for the cell next to its target, not for the target itself', () => {
      const { world, system, self } = setup();

      system(world, 1 / 60);

      // A move order to a cell centre, handed to the same
      // MoveTarget pipeline a player's click-to-move order uses — not a
      // velocity aimed at the target's live position.
      expect(self.moveTarget).toEqual({ position: centre(9, 0) });
      expect(self.pursuit?.entityId).toBe(1);
    });

    it('heads for a diagonal neighbour when the target is off-axis', () => {
      const { world, system, self } = setup(centre(10, 10));

      system(world, 1 / 60);

      expect(self.moveTarget).toEqual({ position: centre(9, 9) });
    });

    it('stops a ranged unit at the edge of its range instead of closing to melee', () => {
      const { world, system, self } = setup(centre(10, 0), 5);

      system(world, 1 / 60);

      // Five cells short of the target, not one.
      expect(self.moveTarget).toEqual({ position: centre(5, 0) });
    });

    it('takes no step at all for a ranged unit already inside its range', () => {
      const { world, system, self } = setup(centre(5, 0), 5);

      system(world, 1 / 60);

      expect(self.moveTarget).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
    });

    it('comes to rest facing its target once standing on a cell centre in reach', () => {
      const { world, system, self } = setup(centre(1, 0));

      system(world, 1 / 60);

      expect(self.velocity).toEqual({ x: 0, y: 0 });
      expect(self.moveTarget).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.pursuit).toBeUndefined();
      // Due east.
      expect(self.transform.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('counts a diagonal neighbour as in reach, same as an orthogonal one', () => {
      const { world, system, self } = setup(centre(1, 1));

      system(world, 1 / 60);

      expect(self.velocity).toEqual({ x: 0, y: 0 });
      expect(self.moveTarget).toBeUndefined();
      expect(self.transform.rotation).toBeCloseTo((Math.PI * 3) / 4);
    });

    it('quantizes the facing it settles into to the nearest of 8 directions', () => {
      // A shallow, off-diagonal offset, well inside a generous attack range.
      const { world, system, self } = setup(centre(10, -1), 20);

      system(world, 1 / 60);

      expect(self.transform.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('finishes onto the cell centre before it will stand and fight', () => {
      // In reach of its target, but part-way across its own cell — the exact
      // state this covers. It gets a move order onto the centre rather than
      // stopping where it stands.
      const { world, system, self } = setup(centre(1, 0), 1, { x: 26, y: 16 });

      system(world, 1 / 60);

      expect(self.moveTarget).toEqual({ position: centre(0, 0) });
      expect(self.pursuit?.entityId).toBe(1);
      // Not yet engaged: it hasn't arrived, so it hasn't turned to face.
      expect(self.transform.rotation).toBe(0);
    });

    it('waits for the move pipeline to finish the leg rather than stopping within tolerance of the centre', () => {
      const { world, system, self } = setup(centre(1, 0), 1, { x: 16.5, y: 16 });
      // Mid-leg: MoveTargetSystem has not dropped this yet, so the unit has
      // not arrived however close it looks.
      self.moveTarget = { position: { ...centre(0, 0) } };
      self.velocity.x = 5;

      system(world, 1 / 60);

      expect(self.moveTarget).toEqual({ position: centre(0, 0) });
      expect(self.velocity.x).toBe(5);
    });

    it('leaves velocity untouched for an entity with no target', () => {
      const { world, system, self } = setup();
      delete (self as Entity).target;
      self.velocity.x = 3;
      self.velocity.y = 4;

      system(world, 1 / 60);

      expect(self.velocity).toEqual({ x: 3, y: 4 });
    });

    it('leaves velocity untouched when the target no longer resolves to an entity', () => {
      const { world, system, self } = setup();
      self.target = { entityId: 9999 };
      self.velocity.x = 3;
      self.velocity.y = 4;

      system(world, 1 / 60);

      expect(self.velocity).toEqual({ x: 3, y: 4 });
    });
  });

  describe('choosing a cell no other unit has claimed', () => {
    const openGround = gridFrom(`
      .....
      .....
      .....
      .....
      .....
    `);

    function setup() {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const occupancy = new OccupancyGrid(openGround);
      const system = createSeekSystem(queries, openGround, occupancy);

      const target = world.add({
        id: 1,
        transform: { position: { ...centre(4, 0) }, rotation: 0 },
      });
      const self = world.add({
        id: 2,
        transform: { position: { ...centre(0, 0) }, rotation: 0 },
        velocity: { x: 0, y: 0 },
        moveSpeed: { value: CELL_SIZE },
        attackRange: { value: 1 },
        target: { entityId: target.id! },
      });

      /** Parks some other unit's claim on a cell. */
      const claim = (col: number, row: number) => {
        occupancy.reserve(occupancy.indexOf(col, row), occupancy.claimOccupantId());
      };

      return { world, system, self, target, claim, occupancy };
    }

    it('walks past a taken cell to the nearest free one', () => {
      const { world, system, self, claim } = setup();
      claim(3, 0);

      system(world, 1 / 60);

      expect(self.moveTarget).toEqual({ position: centre(3, 1) });
    });

    it('settles on its own cell centre when every cell in reach is taken', () => {
      const { world, system, self, claim } = setup();
      // Every in-bounds neighbour of the target; the rest are off the map.
      claim(3, 0);
      claim(3, 1);
      claim(4, 1);
      self.velocity.x = 99;

      system(world, 1 / 60);

      expect(self.moveTarget).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
      // Not engaged — it never got in reach — so it hasn't turned to face.
      expect(self.transform.rotation).toBe(0);
    });

    it('is never blocked by its own claim on the cell it already stands in', () => {
      const { world, system, self, occupancy } = setup();
      // Standing on the cell it would attack from, holding it itself — the
      // steady state of an engaged unit, which must not read as "taken".
      self.transform.position = { ...centre(3, 0) };
      const occupantId = occupancy.claimOccupantId();
      occupancy.reserve(occupancy.indexOf(3, 0), occupantId);
      self.cellOccupancy = {
        occupantId,
        cell: occupancy.indexOf(3, 0),
        reserved: -1,
        blockedFor: 0,
        rerouted: false,
      };

      system(world, 1 / 60);

      expect(self.velocity).toEqual({ x: 0, y: 0 });
      expect(self.moveTarget).toBeUndefined();
      expect(self.transform.rotation).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('routing around walls', () => {
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
      // straight at the target through column 2 — and ending at the cell the
      // unit will fight from, west of the target, rather than on top of it.
      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(3, 0));
      expect(self.movePath?.waypoints).not.toContainEqual(centre(2, 0));
      // Velocity is MoveTargetSystem's to write, once MovePathSystem hands
      // over the first leg later in the same fixed step.
      expect(self.velocity).toEqual({ x: 0, y: 0 });
    });

    it('walks straight at the cell it has a clear line to, planning no route', () => {
      const { world, system, self } = setup(openGround);

      system(world, 1 / 60);

      expect(self.movePath).toBeUndefined();
      expect(self.moveTarget).toEqual({ position: centre(3, 0) });
      // A straight-line approach has no route to throttle, so the first tick
      // that needs one is free to plan it immediately.
      expect(self.pursuit?.sinceReplan).toBe(PURSUIT_REPATH_INTERVAL);
    });

    it('is straight-line only with no grid at all, exactly as before', () => {
      const { world, system, self } = setup(undefined);

      system(world, 1 / 60);

      expect(self.movePath).toBeUndefined();
      expect(self.moveTarget).toEqual({ position: centre(3, 0) });
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
      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(3, 2));
      expect(self.movePath?.index).toBe(0);
    });

    it('replans once a still-unseen target has drifted a cell from where the route was planned', () => {
      const { world, system, self, enemy } = setup(wallWithGap);

      system(world, 1 / 60);
      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(3, 0));

      // Still behind the wall, but a good way down it.
      enemy.transform!.position = { ...centre(4, 3) };
      system(world, PURSUIT_REPATH_INTERVAL);

      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(3, 2));
      expect(self.pursuit?.plannedPosition).toEqual(centre(4, 3));
      expect(self.pursuit?.sinceReplan).toBe(0);
    });

    it('does not replan for a drifting target until the throttle interval has elapsed', () => {
      const { world, system, self, enemy } = setup(wallWithGap);

      system(world, 1 / 60);
      enemy.transform!.position = { ...centre(4, 3) };

      // Well short of PURSUIT_REPATH_INTERVAL: the stale route stands.
      system(world, 1 / 60);

      expect(self.movePath?.waypoints.at(-1)).toEqual(centre(3, 0));
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

      expect(self.movePath).toBeUndefined();
      expect(self.moveTarget).toEqual({ position: centre(0, 2) });
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

    it('walks onto its cell centre rather than freezing mid-step when its target dies', () => {
      // Part-way across cell (0, 0) when the enemy it was walking toward
      // dies. Stopping dead here would leave it standing visibly off-grid —
      // and, since `isSettled` gates being attacked as well as attacking,
      // unhittable where it stands.
      const { world, system, self, enemy } = setup(wallWithGap, { x: 26, y: 16 });

      system(world, 1 / 60);
      enemy.health!.current = 0;
      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.moveTarget).toEqual({ position: centre(0, 0) });
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
      // Diagonally across the wall's corner: within reach in cell steps, but
      // with no line of sight to it.
      const { world, system, self } = setup(wallWithGap, centre(1, 0));
      self.attackRange!.value = 4;

      system(world, 1 / 60);

      expect(self.pursuit).toBeUndefined();
      expect(self.movePath).toBeUndefined();
      expect(self.moveTarget).toBeUndefined();
      expect(self.velocity).toEqual({ x: 0, y: 0 });
      expect(self.transform.rotation).toBeCloseTo(Math.PI / 2);
    });
  });
});
