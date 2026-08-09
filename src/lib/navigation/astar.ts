import type { Point } from '../math/types';

import { arrayIncludesByEquals, removeNullable } from '~/lib/array';
import { toEqual } from '~/lib/predicate';

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

export const getLowestFNode = (nodes: Node[]): Node | null => {
  let lowestFNode = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.f < lowestFNode.f) {
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

type Grid = number[][];

export const isPositionInsideGrid = (
  grid: Readonly<Grid>,
  position: Point
): boolean => {
  return (
    position.y >= 0 &&
    position.y < grid.length &&
    position.x >= 0 &&
    position.x < grid[position.y].length
  );
};

export const generateAdjacentNodes = (
  grid: Grid,
  currentNode: Node
): Node[] => {
  return relativeAdjacentPositions
    .map((relativeAdjacentPosition) => {
      const position: Point = {
        x: currentNode.position.x + relativeAdjacentPosition.x,
        y: currentNode.position.y + relativeAdjacentPosition.y,
      };

      // check if position is in range of the grid
      if (!isPositionInsideGrid(grid, position)) {
        return;
      }

      // check if walkable terrain
      if (grid[position.y][position.x] !== 0) {
        return;
      }

      return new Node(currentNode, position);
    })
    .filter(removeNullable) as Node[];
};

const MOVE_STRAIGHT_COST = 10;
const MOVE_DIAGONAL_COST = 14;

export const calculateDistanceCost = (from: Node, to: Node): number => {
  const xDistance = Math.abs(from.position.x - to.position.x);
  const yDistance = Math.abs(from.position.y - to.position.y);
  const remaining = Math.abs(xDistance - yDistance);

  return (
    MOVE_DIAGONAL_COST * Math.min(xDistance, yDistance) +
    MOVE_STRAIGHT_COST * remaining
  );
};

export const astar = (grid: Grid, start: Point, end: Point): Path => {
  const startNode = new Node(null, start);
  const endNode = new Node(null, end);

  const openList: Node[] = [];
  const closedList: Node[] = [];

  openList.push(startNode);

  while (openList.length > 0) {
    const currentNode = getLowestFNode(openList);
    if (currentNode == null) {
      break;
    }

    // remove from openList
    openList.splice(openList.indexOf(currentNode), 1);

    closedList.push(currentNode);

    if (currentNode.equals(endNode)) {
      return createPathFromEndNode(currentNode);
    }

    const adjacentNodes = generateAdjacentNodes(grid, currentNode);

    for (const adjacentNode of adjacentNodes) {
      if (arrayIncludesByEquals(closedList, adjacentNode)) {
        continue;
      }

      // set cost values
      adjacentNode.g = currentNode.g + 1;
      adjacentNode.h = calculateDistanceCost(adjacentNode, endNode);
      adjacentNode.calculateF();

      if (arrayIncludesByEquals(openList, adjacentNode)) {
        const openNode = openList.find(toEqual(adjacentNode))!;
        //
        if (adjacentNode.g > openNode.g) {
          continue;
        }
      }

      openList.push(adjacentNode);
    }
  }

  return [];
};
