import type { Point } from '../math/types';

import { removeNullable } from '~/lib/array';

export const isPositionEqual = (a: Point, b: Point): boolean => {
  return a.x === b.x && a.y === b.y;
};

export class Node {
  /**
   * The distance between the current node and the start node.
   */
  public g = 0;

  /**
   * The heuristic — estimated distance from the current node to the end node.
   */
  public h = 0;

  /**
   * The total cost of the node.
   */
  public f = 0;

  constructor(
    public readonly parent: Node | null = null,
    public readonly position: Point
  ) {}

  public calculateF(): void {
    this.f = this.g + this.h;
  }

  public equals(other: unknown): boolean {
    if (other instanceof Node) {
      return isPositionEqual(this.position, other.position);
    }

    return false;
  }

  public toString(): string {
    return this.position.x + ',' + this.position.y;
  }
}

/**
 * The open-list node to expand next: lowest `f`, and on a tie the one with
 * the *larger* `g` — equivalently the smaller heuristic, i.e. the one already
 * closer to the goal.
 *
 * The tie-break matters. On open ground a great many nodes share the optimal
 * `f`, and picking arbitrarily among them makes the search fan out sideways
 * and produces a path that dawdles (a run of straight steps before the
 * diagonals) even though it costs the same. Preferring the deeper node
 * commits to progress, expands fewer nodes, and yields the path a player
 * expects to see drawn.
 */
export const getLowestFNode = (nodes: Node[]): Node | null => {
  let lowestFNode = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.f < lowestFNode.f) {
      lowestFNode = node;
    } else if (node.f === lowestFNode.f && node.g > lowestFNode.g) {
      lowestFNode = node;
    }
  }

  return lowestFNode ?? null;
};

export type Path = Node[];

export const createPathFromEndNode = (endNode: Node): Path => {
  const path = [];
  path.push(endNode);

  let currentNode = endNode;
  while (currentNode.parent !== null) {
    path.push(currentNode.parent);
    currentNode = currentNode.parent;
  }

  path.reverse();

  return path;
};

const relativeAdjacentPositions: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
];

/**
 * The engine's own walkability data, exactly as a loaded map exposes it (see
 * `ParsedMap` in `~/game/map/loadTiledMap`): a flat, **row-major** buffer
 * indexed `collision[y * width + x]`, where a non-zero byte blocks movement.
 *
 * `width` is what turns a flat buffer back into two dimensions, so it is not
 * optional and never inferred: the original `MovePathSystem` indexed its
 * collision map as `map[cell.y][cell.y]` — `y` twice — which silently
 * reported the wrong walkability for every off-diagonal cell. Every read in
 * this module goes through {@link isWalkable}, which takes `x` and `y` as
 * separate arguments so that mistake can't be spelled.
 */
export interface CollisionGrid {
  readonly width: number;
  readonly height: number;
  readonly collision: Uint8Array;
}

/**
 * Either the engine's {@link CollisionGrid} or a plain nested array of rows
 * (`rows[y][x]`, non-zero = blocked). The nested form is what test fixtures
 * and the original ported spec use; {@link toCollisionGrid} normalises it, so
 * there is exactly one search implementation rather than one per grid shape.
 */
export type GridLike = CollisionGrid | readonly (readonly number[])[];

const isCollisionGrid = (grid: GridLike): grid is CollisionGrid => {
  return typeof (grid as CollisionGrid).width === 'number';
};

/** Normalises any {@link GridLike} into a {@link CollisionGrid}. */
export const toCollisionGrid = (grid: GridLike): CollisionGrid => {
  if (isCollisionGrid(grid)) {
    return grid;
  }

  const height = grid.length;
  const width = height === 0 ? 0 : Math.max(...grid.map((row) => row.length));
  const collision = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // A ragged row's missing cells count as blocked rather than walkable —
      // there is no terrain there to walk on.
      collision[y * width + x] = (grid[y][x] ?? 1) !== 0 ? 1 : 0;
    }
  }

  return { width, height, collision };
};

/** Whether (`x`, `y`) is inside the grid and not blocked by terrain. */
export const isWalkable = (
  grid: CollisionGrid,
  x: number,
  y: number
): boolean => {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    return false;
  }

  return grid.collision[y * grid.width + x] === 0;
};

/** Flat index of a cell in {@link CollisionGrid.collision}. */
const cellIndex = (grid: CollisionGrid, position: Point): number => {
  return position.y * grid.width + position.x;
};

export const isPositionInsideGrid = (
  grid: GridLike,
  position: Point
): boolean => {
  const { width, height } = toCollisionGrid(grid);

  return (
    position.y >= 0 &&
    position.y < height &&
    position.x >= 0 &&
    position.x < width
  );
};

/**
 * Whether a diagonal step from (`x`, `y`) by (`dx`, `dy`) clips a wall
 * corner — the classic "cut through a wall corner" move.
 *
 * The rule is strict: a diagonal is rejected when **either** orthogonal
 * neighbour it passes between is blocked, not just when both are. A unit
 * can never step diagonally past a wall, even brushing a single corner of
 * it — it must take the two straight steps around instead.
 *
 * Path smoothing ({@link hasLineOfSight}) applies the same rule when
 * merging waypoints, so the smoothed polyline a unit actually walks never
 * clips a wall corner either.
 */
const cutsWallCorner = (
  grid: CollisionGrid,
  x: number,
  y: number,
  dx: number,
  dy: number
): boolean => {
  if (dx === 0 || dy === 0) {
    return false;
  }

  return !isWalkable(grid, x + dx, y) || !isWalkable(grid, x, y + dy);
};

export const generateAdjacentNodes = (
  grid: GridLike,
  currentNode: Node
): Node[] => {
  const collisionGrid = toCollisionGrid(grid);
  const { x, y } = currentNode.position;

  return relativeAdjacentPositions
    .map((relativeAdjacentPosition) => {
      const { x: dx, y: dy } = relativeAdjacentPosition;

      // Covers both "outside the grid" and "blocked terrain".
      if (!isWalkable(collisionGrid, x + dx, y + dy)) {
        return;
      }

      if (cutsWallCorner(collisionGrid, x, y, dx, dy)) {
        return;
      }

      return new Node(currentNode, { x: x + dx, y: y + dy });
    })
    .filter(removeNullable) as Node[];
};

export const MOVE_STRAIGHT_COST = 10;
export const MOVE_DIAGONAL_COST = 14;

export const calculateDistanceCost = (from: Node, to: Node): number => {
  const xDistance = Math.abs(from.position.x - to.position.x);
  const yDistance = Math.abs(from.position.y - to.position.y);
  const remaining = Math.abs(xDistance - yDistance);

  return (
    MOVE_DIAGONAL_COST * Math.min(xDistance, yDistance) +
    MOVE_STRAIGHT_COST * remaining
  );
};

/** Cost of a single 8-way step between two adjacent cells. */
const stepCost = (from: Point, to: Point): number => {
  return from.x !== to.x && from.y !== to.y
    ? MOVE_DIAGONAL_COST
    : MOVE_STRAIGHT_COST;
};

/** Outcome of a {@link findPath} call. */
export type PathStatus =
  /** A route to the destination was found. */
  | 'found'
  /** Every reachable cell was expanded without reaching the destination. */
  | 'unreachable'
  /** The `maxNodes` budget ran out before the destination was reached. */
  | 'exhausted'
  /** The start cell is outside the grid. */
  | 'invalid-start'
  /** The destination is outside the grid, or blocked with no usable fallback. */
  | 'invalid-destination';

export interface PathResult {
  status: PathStatus;
  /**
   * Cell coordinates from the start cell to the destination cell inclusive,
   * reduced to corner waypoints unless `smooth: false` was requested. Empty
   * for every status other than `'found'`.
   */
  cells: Point[];
  /** How many nodes the search expanded — the bound the search ran under. */
  expanded: number;
  /**
   * The cell actually routed to. Equal to the requested destination unless it
   * was blocked and relocated by `blockedDestination: 'nearest'`.
   */
  destination?: Point;
}

export interface FindPathOptions {
  /**
   * Hard ceiling on expanded nodes, so an unreachable or pathological
   * destination fails fast instead of hanging. Defaults to the grid's cell
   * count, which no search can exceed anyway (each cell is expanded at most
   * once) — the default is a safety net, and a smaller value is a deliberate
   * budget.
   */
  maxNodes?: number;
  /**
   * What to do when the destination cell is itself blocked.
   *
   * - `'nearest'` (default) reroutes to the closest walkable cell within
   *   {@link nearestSearchRadius}. This is what a click on a wall should do:
   *   walk up to the wall rather than silently ignore the order.
   * - `'fail'` returns `'invalid-destination'` and no path.
   */
  blockedDestination?: 'nearest' | 'fail';
  /** Ring radius, in cells, that `'nearest'` searches. Defaults to 16. */
  nearestSearchRadius?: number;
  /** Whether to reduce the cell path to corner waypoints. Defaults to true. */
  smooth?: boolean;
}

interface SearchResult {
  node: Node | null;
  expanded: number;
  exhausted: boolean;
}

/**
 * The raw 8-way A* search: straight steps cost {@link MOVE_STRAIGHT_COST},
 * diagonals {@link MOVE_DIAGONAL_COST}, with the same octile distance as the
 * heuristic so it never overestimates and the first path found is a shortest
 * one.
 *
 * Membership in the open and closed sets is tracked in a `Map`/`Set` keyed by
 * flat cell index rather than by scanning the lists: on a 64x64 map an
 * exhaustive search closes several thousand nodes, and a linear membership
 * scan per neighbour turns a click into a visible stall.
 *
 * The start cell's own walkability is deliberately not checked — a unit that
 * has somehow ended up inside a wall must still be able to path its way out.
 */
const searchAstar = (
  grid: CollisionGrid,
  start: Point,
  end: Point,
  maxNodes: number
): SearchResult => {
  const startNode = new Node(null, start);
  const endNode = new Node(null, end);
  startNode.h = calculateDistanceCost(startNode, endNode);
  startNode.calculateF();

  const openList: Node[] = [startNode];
  const openByIndex = new Map<number, Node>([
    [cellIndex(grid, start), startNode],
  ]);
  const closed = new Set<number>();
  let expanded = 0;

  while (openList.length > 0) {
    if (expanded >= maxNodes) {
      return { node: null, expanded, exhausted: true };
    }

    const currentNode = getLowestFNode(openList)!;
    openList.splice(openList.indexOf(currentNode), 1);

    const currentIndex = cellIndex(grid, currentNode.position);
    openByIndex.delete(currentIndex);
    closed.add(currentIndex);
    expanded++;

    if (currentNode.equals(endNode)) {
      return { node: currentNode, expanded, exhausted: false };
    }

    for (const adjacentNode of generateAdjacentNodes(grid, currentNode)) {
      const index = cellIndex(grid, adjacentNode.position);
      if (closed.has(index)) {
        continue;
      }

      adjacentNode.g =
        currentNode.g + stepCost(currentNode.position, adjacentNode.position);
      adjacentNode.h = calculateDistanceCost(adjacentNode, endNode);
      adjacentNode.calculateF();

      const openNode = openByIndex.get(index);
      if (openNode) {
        if (adjacentNode.g >= openNode.g) {
          continue;
        }
        openList.splice(openList.indexOf(openNode), 1);
      }

      openList.push(adjacentNode);
      openByIndex.set(index, adjacentNode);
    }
  }

  return { node: null, expanded, exhausted: false };
};

/**
 * Finds a walkable route between two cells, as a linked {@link Path} of
 * nodes. Kept as the module's original entry point (and shape) for callers
 * that want the node chain; {@link findPath} is the richer one that reports
 * *why* there is no path and hands back plain cell coordinates.
 */
export const astar = (grid: GridLike, start: Point, end: Point): Path => {
  const collisionGrid = toCollisionGrid(grid);
  const { node } = searchAstar(
    collisionGrid,
    start,
    end,
    collisionGrid.width * collisionGrid.height
  );

  return node === null ? [] : createPathFromEndNode(node);
};

/**
 * Whether a straight line between two cell centres stays on walkable
 * terrain, using a supercover traversal — every cell the segment passes
 * through is tested, not just the ones a plain Bresenham line would visit.
 *
 * Where the segment crosses exactly through a shared corner, *both* cells
 * touching that corner must be walkable — the same strict rule the search
 * applies via {@link cutsWallCorner}, so smoothing can only ever delete
 * waypoints from an already-valid path and never invent a route the search
 * wouldn't allow.
 */
export const hasLineOfSight = (
  grid: CollisionGrid,
  from: Point,
  to: Point
): boolean => {
  if (!isWalkable(grid, from.x, from.y)) {
    return false;
  }

  let x = from.x;
  let y = from.y;
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  const xStep = dx < 0 ? -1 : 1;
  const yStep = dy < 0 ? -1 : 1;
  dx = Math.abs(dx);
  dy = Math.abs(dy);

  const doubleDx = 2 * dx;
  const doubleDy = 2 * dy;

  if (dx >= dy) {
    let errorPrevious = dx;
    let error = dx;
    for (let i = 0; i < dx; i++) {
      x += xStep;
      error += doubleDy;
      if (error > doubleDx) {
        y += yStep;
        error -= doubleDx;
        const sum = error + errorPrevious;
        if (sum < doubleDx) {
          if (!isWalkable(grid, x, y - yStep)) {
            return false;
          }
        } else if (sum > doubleDx) {
          if (!isWalkable(grid, x - xStep, y)) {
            return false;
          }
        } else if (
          !isWalkable(grid, x, y - yStep) ||
          !isWalkable(grid, x - xStep, y)
        ) {
          return false;
        }
      }
      if (!isWalkable(grid, x, y)) {
        return false;
      }
      errorPrevious = error;
    }
  } else {
    let errorPrevious = dy;
    let error = dy;
    for (let i = 0; i < dy; i++) {
      y += yStep;
      error += doubleDx;
      if (error > doubleDy) {
        x += xStep;
        error -= doubleDy;
        const sum = error + errorPrevious;
        if (sum < doubleDy) {
          if (!isWalkable(grid, x - xStep, y)) {
            return false;
          }
        } else if (sum > doubleDy) {
          if (!isWalkable(grid, x, y - yStep)) {
            return false;
          }
        } else if (
          !isWalkable(grid, x - xStep, y) ||
          !isWalkable(grid, x, y - yStep)
        ) {
          return false;
        }
      }
      if (!isWalkable(grid, x, y)) {
        return false;
      }
      errorPrevious = error;
    }
  }

  return true;
};

/**
 * Reduces a cell-by-cell path to just the cells where it changes direction
 * around an obstacle ("string pulling"): walk forward from an anchor while
 * the anchor still has {@link hasLineOfSight} to the candidate, and drop
 * every cell in between.
 *
 * Without this a unit stair-steps its way across open ground, visibly
 * zig-zagging one cell at a time; with it, an unobstructed order is a single
 * straight segment. The result is always a subsequence of the input, so it
 * never introduces a step the search itself rejected.
 */
export const smoothCellPath = (
  grid: CollisionGrid,
  cells: readonly Point[]
): Point[] => {
  if (cells.length <= 2) {
    return cells.map((cell) => ({ ...cell }));
  }

  const smoothed: Point[] = [{ ...cells[0] }];
  let anchor = cells[0];

  for (let i = 2; i < cells.length; i++) {
    if (!hasLineOfSight(grid, anchor, cells[i])) {
      anchor = cells[i - 1];
      smoothed.push({ ...anchor });
    }
  }

  smoothed.push({ ...cells[cells.length - 1] });

  return smoothed;
};

/**
 * Closest walkable cell to `cell`, searched outward one square ring at a
 * time and, within a ring, by true (squared euclidean) distance so the
 * result doesn't depend on scan order. Returns `cell` itself when it is
 * already walkable, or `undefined` if nothing walkable lies within
 * `maxRadius` rings.
 */
export const findNearestWalkable = (
  grid: CollisionGrid,
  cell: Point,
  maxRadius = 16
): Point | undefined => {
  if (isWalkable(grid, cell.x, cell.y)) {
    return { ...cell };
  }

  for (let radius = 1; radius <= maxRadius; radius++) {
    let best: Point | undefined;
    let bestDistance = Infinity;

    for (let y = cell.y - radius; y <= cell.y + radius; y++) {
      for (let x = cell.x - radius; x <= cell.x + radius; x++) {
        const ring = Math.max(Math.abs(x - cell.x), Math.abs(y - cell.y));
        if (ring !== radius || !isWalkable(grid, x, y)) {
          continue;
        }

        const distance = (x - cell.x) ** 2 + (y - cell.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }

    if (best) {
      return best;
    }
  }

  return undefined;
};

/**
 * Plans a route between two cells over real collision data, reporting both
 * the waypoints and *why* there aren't any — an unreachable destination is a
 * normal outcome the caller has to render sensibly, not an exception.
 *
 * The search is always bounded (see {@link FindPathOptions.maxNodes}) so a
 * destination walled off from the start terminates rather than hanging, and
 * a blocked destination is, by default, relocated to the nearest walkable
 * cell rather than refused.
 */
export const findPath = (
  grid: GridLike,
  start: Point,
  end: Point,
  {
    maxNodes,
    blockedDestination = 'nearest',
    nearestSearchRadius,
    smooth = true,
  }: FindPathOptions = {}
): PathResult => {
  const collisionGrid = toCollisionGrid(grid);

  if (!isPositionInsideGrid(collisionGrid, start)) {
    return { status: 'invalid-start', cells: [], expanded: 0 };
  }
  if (!isPositionInsideGrid(collisionGrid, end)) {
    return { status: 'invalid-destination', cells: [], expanded: 0 };
  }

  let destination: Point | undefined = { ...end };
  if (!isWalkable(collisionGrid, end.x, end.y)) {
    destination =
      blockedDestination === 'nearest'
        ? findNearestWalkable(collisionGrid, end, nearestSearchRadius)
        : undefined;
  }
  if (!destination) {
    return { status: 'invalid-destination', cells: [], expanded: 0 };
  }

  if (isPositionEqual(start, destination)) {
    return {
      status: 'found',
      cells: [{ ...start }],
      expanded: 0,
      destination,
    };
  }

  const { node, expanded, exhausted } = searchAstar(
    collisionGrid,
    start,
    destination,
    maxNodes ?? collisionGrid.width * collisionGrid.height
  );

  if (node === null) {
    return {
      status: exhausted ? 'exhausted' : 'unreachable',
      cells: [],
      expanded,
      destination,
    };
  }

  const cells = createPathFromEndNode(node).map(({ position }) => position);

  return {
    status: 'found',
    cells: smooth ? smoothCellPath(collisionGrid, cells) : cells,
    expanded,
    destination,
  };
};
