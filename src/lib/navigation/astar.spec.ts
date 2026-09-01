import { describe, expect, it } from 'vitest';

import {
  astar,
  createPathFromEndNode,
  findNearestWalkable,
  findPath,
  getLowestFNode,
  hasLineOfSight,
  isPositionEqual,
  isPositionInsideGrid,
  isWalkable,
  Node,
  generateAdjacentNodes,
  calculateDistanceCost,
  smoothCellPath,
  toCollisionGrid,
} from './astar';

describe('isPositionEqual', () => {
  it('should return false when values differ', () => {
    expect(isPositionEqual({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('should return false when values differ in float', () => {
    expect(isPositionEqual({ x: 1.1, y: 1.1 }, { x: 1, y: 1 })).toBe(false);
  });

  it('should return true when values are the same', () => {
    expect(isPositionEqual({ x: 123, y: 123 }, { x: 123, y: 123 })).toBe(true);
  });
});

describe('getLowestFCostNode', () => {
  it('should return null when array is empty', () => {
    expect(getLowestFNode([])).toEqual(null);
  });

  it('should return lowest fCost node', () => {
    const randomNodes = Array.from({ length: 100 }, (value, index) => {
      const node = new Node(null, { x: index, y: index });
      node.f = Math.random() * 100 + 1;
      return node;
    });

    const lowestNode = new Node(null, { x: 2, y: 2 });
    lowestNode.f = 1;

    expect(getLowestFNode([...randomNodes, lowestNode])).toEqual(lowestNode);
  });
});

describe('createPathFromEndNode', () => {
  it('should return node when only one is given', () => {
    const node = new Node(null, { x: 1, y: 2 });

    const path = createPathFromEndNode(node);

    expect(path).toHaveLength(1);
  });

  it('should return reversed path when nodes with parents are given', () => {
    let lastNode: Node | null = null;
    Array.from(
      { length: 10 },
      (value, index) => (lastNode = new Node(lastNode, { x: index, y: index }))
    );

    const path = createPathFromEndNode(lastNode!);

    expect(path).toHaveLength(10);
    expect(path.at(0)?.parent).toEqual(null);
    expect(path.at(-1)).toEqual(lastNode);
  });
});

describe('isPositionInsideGrid', () => {
  it('should return false if the grid is empty', () => {
    expect(isPositionInsideGrid([], { x: 1, y: 1 })).toBe(false);
  });

  const grid: readonly number[][] = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];

  it('should return false when x is lower than 0', () => {
    expect(isPositionInsideGrid(grid, { x: -1, y: 1 })).toBe(false);
  });

  it('should return false when y is lower than 0', () => {
    expect(isPositionInsideGrid(grid, { x: 1, y: -1 })).toBe(false);
  });

  it("should return false when x is higher than the grid's width", () => {
    expect(isPositionInsideGrid(grid, { x: 5, y: 1 })).toBe(false);
  });

  it("should return false when y is higher than the grid's height", () => {
    expect(isPositionInsideGrid(grid, { x: 1, y: 5 })).toBe(false);
  });

  it('should return true when x and y is 0 and the grid has at least 1 item', () => {
    expect(isPositionInsideGrid(grid, { x: 0, y: 0 })).toBe(true);
  });

  it("should return true when x is the same as the grid's width", () => {
    expect(isPositionInsideGrid(grid, { x: 4, y: 0 })).toBe(true);
  });

  it("should return true when y is the same as the grid's height", () => {
    expect(isPositionInsideGrid(grid, { x: 0, y: 4 })).toBe(true);
  });
});

describe('generateAdjacentNodes', () => {
  const grid = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 1],
  ];

  it('should generate all nodes around the current node when inside the grid', () => {
    const nodes = generateAdjacentNodes(grid, new Node(null, { x: 1, y: 1 }));

    expect(nodes).toHaveLength(8);
  });

  it('should generate nodes inside the grid when at the edge of the grid', () => {
    const nodes = generateAdjacentNodes(grid, new Node(null, { x: 0, y: 0 }));

    expect(nodes).toHaveLength(3);
  });

  it('should generate all walkable nodes', () => {
    const nodes = generateAdjacentNodes(grid, new Node(null, { x: 2, y: 2 }));

    expect(nodes).toHaveLength(7);
  });
});

describe('calculateDistanceCost', () => {
  it('should calculate by straight route', () => {
    expect(
      calculateDistanceCost(
        new Node(null, { x: 0, y: 0 }),
        new Node(null, { x: 3, y: 0 })
      )
    ).toEqual(30);
  });

  it('should calculate by diagonal route', () => {
    expect(
      calculateDistanceCost(
        new Node(null, { x: 0, y: 0 }),
        new Node(null, { x: 3, y: 3 })
      )
    ).toEqual(42);
  });

  it('should calculate by combined route', () => {
    expect(
      calculateDistanceCost(
        new Node(null, { x: 0, y: 0 }),
        new Node(null, { x: 3, y: 5 })
      )
    ).toEqual(62);
  });
});

describe('astar', () => {
  it('should return empty array because there is no way to the given end', () => {
    const grid = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1],
      [0, 0, 0, 1, 0],
    ];

    const start = { x: 0, y: 0 };
    const end = { x: 4, y: 4 };

    const path = astar(grid, start, end);

    expect(path).toHaveLength(0);
  });

  it('should go around obstruction', () => {
    const grid = [
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];

    const start = { x: 0, y: 0 };
    const end = { x: 7, y: 6 };

    const path = astar(grid, start, end);

    expect(path).toHaveLength(9);
    expect(path[1].position).toEqual({ x: 1, y: 1 });
    expect(path[2].position).toEqual({ x: 2, y: 2 });
    expect(path[3].position).toEqual({ x: 3, y: 3 });
    expect(path[4].position).toEqual({ x: 3, y: 4 });
    expect(path[5].position).toEqual({ x: 4, y: 5 });
    expect(path[6].position).toEqual({ x: 5, y: 6 });
    expect(path[7].position).toEqual({ x: 6, y: 6 });
  });

  it('should go though the maze', () => {
    const maze = [
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      [1, 1, 1, 1, 0, 1, 1, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      [0, 1, 1, 0, 1, 1, 1, 0, 1, 0],
      [0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const start = { x: 0, y: 0 };
    const end = { x: 9, y: 9 };

    const path = astar(maze, start, end);

    expect(path).toHaveLength(39);
  });
});

/**
 * Builds a {@link CollisionGrid} from an ASCII map — `#` is a wall,
 * everything else walkable — so a fixture reads as the shape it actually
 * tests rather than as a wall of digits.
 */
const gridFrom = (art: string) =>
  toCollisionGrid(
    art
      .trim()
      .split('\n')
      .map((line) => [...line.trim()].map((cell) => (cell === '#' ? 1 : 0)))
  );

describe('toCollisionGrid', () => {
  it('keeps a collision grid as-is', () => {
    const grid = { width: 2, height: 1, collision: new Uint8Array([0, 1]) };

    expect(toCollisionGrid(grid)).toBe(grid);
  });

  it('flattens nested rows row-major, taking the width from the rows', () => {
    const grid = toCollisionGrid([
      [0, 0, 1],
      [1, 0, 0],
    ]);

    expect(grid).toEqual({
      width: 3,
      height: 2,
      collision: new Uint8Array([0, 0, 1, 1, 0, 0]),
    });
  });

  it('treats an empty grid as zero-sized', () => {
    expect(toCollisionGrid([])).toEqual({
      width: 0,
      height: 0,
      collision: new Uint8Array(),
    });
  });
});

describe('isWalkable', () => {
  // Regression guard for the original `MovePathSystem`'s
  // `collisionMap[cell.y][cell.y]` — `y` used for both axes. The grid is
  // deliberately non-square with asymmetric walls, so an implementation that
  // indexes with `y` twice reports the wrong answer instead of accidentally
  // agreeing on a symmetric square map.
  const wide = gridFrom(`
    .....
    .....
    .#...
  `);

  it('reads the wall at its own (x, y), not at (y, y)', () => {
    // (1, 2) is the wall; (2, 2) — where a `y`-for-`x` index lands — is not.
    expect(isWalkable(wide, 1, 2)).toBe(false);
    expect(isWalkable(wide, 2, 2)).toBe(true);
  });

  it('reads a tall grid where a (y, y) index would run off the end', () => {
    const tall = gridFrom(`
      ...
      ...
      ...
      ...
      #..
    `);

    // Correct index for (0, 4) is 12; `y * width + y` would be 16, past the
    // end of a 15-cell buffer, so the buggy read reports "walkable".
    expect(isWalkable(tall, 0, 4)).toBe(false);
    expect(isWalkable(tall, 1, 4)).toBe(true);
  });

  it('reports every out-of-bounds cell as unwalkable', () => {
    expect(isWalkable(wide, -1, 0)).toBe(false);
    expect(isWalkable(wide, 0, -1)).toBe(false);
    expect(isWalkable(wide, 5, 0)).toBe(false);
    expect(isWalkable(wide, 0, 3)).toBe(false);
  });
});

describe('corner cutting', () => {
  it('rejects the diagonal between two orthogonally-blocking walls', () => {
    const grid = gridFrom(`
      .#
      #.
    `);

    const nodes = generateAdjacentNodes(grid, new Node(null, { x: 0, y: 0 }));

    expect(nodes).toHaveLength(0);
  });

  it('allows a diagonal that only brushes one wall corner', () => {
    const grid = gridFrom(`
      .#
      ..
    `);

    const nodes = generateAdjacentNodes(grid, new Node(null, { x: 0, y: 0 }));

    expect(nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('cannot squeeze through a diagonal-only gap', () => {
    // A one-cell-thick wall laid along the anti-diagonal. Every cell above it
    // touches a cell below it only at a corner, and each such crossing has a
    // wall on both of its orthogonals — so an 8-way search without a corner
    // rule slips straight through a wall it should not be able to pass.
    const grid = gridFrom(`
      ....#
      ...#.
      ..#..
      .#...
      #....
    `);

    expect(findPath(grid, { x: 0, y: 0 }, { x: 4, y: 4 }).status).toBe(
      'unreachable'
    );
  });
});

describe('findPath', () => {
  // A wall column with a single gap along the bottom row: reaching the far
  // side means walking down to the gap and back up, never through the wall.
  const wallWithGap = gridFrom(`
    ....#....
    ....#....
    ....#....
    ....#....
    .........
  `);

  it('routes around a wall with the expected waypoints', () => {
    const result = findPath(wallWithGap, { x: 0, y: 0 }, { x: 8, y: 0 });

    expect(result.status).toBe('found');
    expect(result.cells).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 3 },
      { x: 8, y: 0 },
    ]);
  });

  it('never steps onto a wall cell', () => {
    const { cells } = findPath(wallWithGap, { x: 0, y: 0 }, { x: 8, y: 0 }, {
      smooth: false,
    });

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(isWalkable(wallWithGap, cell.x, cell.y)).toBe(true);
    }
  });

  it('smooths a stair-stepped route down to its corners', () => {
    const raw = findPath(wallWithGap, { x: 0, y: 0 }, { x: 8, y: 0 }, {
      smooth: false,
    });

    expect(raw.cells).toHaveLength(9);
    expect(raw.cells.at(0)).toEqual({ x: 0, y: 0 });
    expect(raw.cells.at(-1)).toEqual({ x: 8, y: 0 });
  });

  it('reduces an unobstructed route to just its endpoints', () => {
    const open = gridFrom(`
      ......
      ......
      ......
      ......
    `);

    expect(findPath(open, { x: 0, y: 0 }, { x: 5, y: 3 }).cells).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 3 },
    ]);
  });

  it('returns the start cell alone when it is already the destination', () => {
    const result = findPath(wallWithGap, { x: 1, y: 1 }, { x: 1, y: 1 });

    expect(result.status).toBe('found');
    expect(result.cells).toEqual([{ x: 1, y: 1 }]);
    expect(result.expanded).toBe(0);
  });

  it('paths a unit standing inside a wall back out of it', () => {
    const grid = gridFrom(`
      ...
      .#.
      ...
    `);

    const result = findPath(grid, { x: 1, y: 1 }, { x: 1, y: 0 });

    expect(result.status).toBe('found');
    expect(result.cells.at(-1)).toEqual({ x: 1, y: 0 });
  });

  describe('unreachable destinations', () => {
    const dividedGrid = gridFrom(`
      ..#..
      ..#..
      ..#..
      ..#..
      ..#..
    `);

    it('reports no path rather than hanging', () => {
      const result = findPath(dividedGrid, { x: 0, y: 0 }, { x: 4, y: 4 });

      expect(result.status).toBe('unreachable');
      expect(result.cells).toEqual([]);
    });

    it('expands no more than the cells it can actually reach', () => {
      const result = findPath(dividedGrid, { x: 0, y: 0 }, { x: 4, y: 4 });

      // Ten walkable cells on the near side of the divide, each closed once.
      expect(result.expanded).toBe(10);
      expect(result.expanded).toBeLessThanOrEqual(
        dividedGrid.width * dividedGrid.height
      );
    });

    it('gives up once the node budget runs out', () => {
      const result = findPath(dividedGrid, { x: 0, y: 0 }, { x: 4, y: 4 }, {
        maxNodes: 4,
      });

      expect(result.status).toBe('exhausted');
      expect(result.cells).toEqual([]);
      expect(result.expanded).toBe(4);
    });
  });

  describe('destinations inside a wall', () => {
    const walledBlock = gridFrom(`
      .....
      .###.
      .###.
      .###.
      .....
    `);

    it('reroutes to the nearest walkable cell by default', () => {
      const result = findPath(walledBlock, { x: 0, y: 0 }, { x: 2, y: 2 });

      expect(result.status).toBe('found');
      expect(result.destination).toEqual({ x: 2, y: 0 });
      expect(result.cells.at(-1)).toEqual({ x: 2, y: 0 });
    });

    it('refuses the order outright when asked to', () => {
      const result = findPath(walledBlock, { x: 0, y: 0 }, { x: 2, y: 2 }, {
        blockedDestination: 'fail',
      });

      expect(result.status).toBe('invalid-destination');
      expect(result.cells).toEqual([]);
    });

    it('refuses when nothing walkable lies within the search radius', () => {
      const result = findPath(walledBlock, { x: 0, y: 0 }, { x: 2, y: 2 }, {
        nearestSearchRadius: 1,
      });

      expect(result.status).toBe('invalid-destination');
    });
  });

  describe('off-grid endpoints', () => {
    const grid = gridFrom(`
      ...
      ...
    `);

    it('reports an out-of-bounds start', () => {
      expect(findPath(grid, { x: -1, y: 0 }, { x: 2, y: 1 }).status).toBe(
        'invalid-start'
      );
    });

    it('reports an out-of-bounds destination', () => {
      expect(findPath(grid, { x: 0, y: 0 }, { x: 3, y: 1 }).status).toBe(
        'invalid-destination'
      );
    });
  });

  it("reads a map's own flat collision buffer", () => {
    // The exact shape `ParsedMap` exposes: non-square, row-major, so a
    // transposed read would path straight through the wall.
    const map = {
      width: 4,
      height: 2,
      collision: new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0]),
    };

    const { status, cells } = findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 }, {
      smooth: false,
    });

    expect(status).toBe('unreachable');
    expect(cells).toEqual([]);
  });
});

describe('hasLineOfSight', () => {
  const grid = gridFrom(`
    .....
    ..#..
    .....
  `);

  it('sees a clear straight line', () => {
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('sees a clear diagonal', () => {
    const open = gridFrom(`
      ....
      ....
      ....
      ....
    `);

    expect(hasLineOfSight(open, { x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
    expect(hasLineOfSight(open, { x: 0, y: 3 }, { x: 3, y: 0 })).toBe(true);
  });

  // Stricter than the search's own corner rule on purpose: smoothing may only
  // ever delete waypoints from an already-valid path, so refusing to merge
  // across a wall corner keeps the drawn polyline off the wall.
  it('refuses a diagonal that clips a wall corner', () => {
    expect(hasLineOfSight(grid, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(false);
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
  });

  it('is blocked by a wall on the line', () => {
    expect(hasLineOfSight(grid, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
  });

  it('is symmetric', () => {
    expect(hasLineOfSight(grid, { x: 4, y: 1 }, { x: 0, y: 1 })).toBe(false);
    expect(hasLineOfSight(grid, { x: 4, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });

  it('has no line of sight out of a wall', () => {
    expect(hasLineOfSight(grid, { x: 2, y: 1 }, { x: 0, y: 1 })).toBe(false);
  });

  it('sees a zero-length line', () => {
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });
});

describe('smoothCellPath', () => {
  const open = gridFrom(`
    .....
    .....
    .....
  `);

  it('leaves a path of two or fewer cells alone', () => {
    expect(smoothCellPath(open, [{ x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }]);
    expect(
      smoothCellPath(open, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it('drops every cell it can see past', () => {
    expect(
      smoothCellPath(open, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('copies cells rather than aliasing the input', () => {
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    const smoothed = smoothCellPath(open, cells);
    smoothed[0].x = 99;

    expect(cells[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('findNearestWalkable', () => {
  const grid = gridFrom(`
    .....
    .###.
    .###.
    .###.
    .....
  `);

  it('returns the cell itself when already walkable', () => {
    expect(findNearestWalkable(grid, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('finds the closest walkable cell outside a wall', () => {
    // (1, 0) is one cell away; the ring's diagonal corner (0, 0) is further.
    expect(findNearestWalkable(grid, { x: 1, y: 1 })).toEqual({ x: 1, y: 0 });
  });

  it('prefers the truly nearest cell over the first one scanned', () => {
    // From the block's centre, (2, 0) and (2, 4) are two cells away while the
    // ring's own corners are further; a scan-order-dependent implementation
    // would return a corner instead.
    expect(findNearestWalkable(grid, { x: 2, y: 2 })).toEqual({ x: 2, y: 0 });
  });

  it('gives up beyond the search radius', () => {
    expect(findNearestWalkable(grid, { x: 2, y: 2 }, 1)).toBeUndefined();
  });
});
