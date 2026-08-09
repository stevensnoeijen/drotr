import { describe, expect, it } from 'vitest';

import { Node, State } from './Node';

describe('Node', () => {
  describe('constructor', () => {
    it('should set 0 children no children are given', () => {
      const node = new Node();

      expect(node.children).toHaveLength(0);
    });

    it("should set all children's parents", () => {
      const node = new Node([new Node([])]);

      expect(node.children[0].parent).toEqual(node);
    });
  });

  describe('set children', () => {
    it('should set 0 children if 0 are given', () => {
      const node = new Node([]);

      expect(node.children).toHaveLength(0);
    });

    it('should set children when given', () => {
      const node = new Node([]);
      node.children = [new Node([])];

      expect(node.children).toHaveLength(1);
      expect(node.children[0].parent).toEqual(node);
    });
  });

  describe('attach', () => {
    it('should add to parent and set parent', () => {
      const parent = new Node([]);
      const child = new Node([]);
      parent.attach(child);

      expect(parent.children).toHaveLength(1);
      expect(child.parent).toEqual(parent);
    });
  });

  describe('detatch', () => {
    it('should remove from children and remove parent', () => {
      const child = new Node([]);
      const parent = new Node([child]);
      parent.detach(child);

      expect(parent.children).toHaveLength(0);
      expect(child.parent).toEqual(null);
    });
  });

  describe('getData', () => {
    it('should get data from node', () => {
      const child = new Node([]);
      child.data.set('test', true);

      expect(child.getData('test')).toEqual(true);
    });

    it("should get data from node's parent", () => {
      const child = new Node([]);
      const parent = new Node([child]);
      parent.data.set('test', true);

      expect(child.getData('test')).toEqual(true);
    });

    it("should get data from node's parent's parent", () => {
      const child = new Node([]);
      const parent = new Node([child]);
      const parentsParent = new Node([parent]);
      parentsParent.data.set('test', true);

      expect(child.getData('test')).toEqual(true);
    });

    it('should not get data from node or any parent', () => {
      const child = new Node([]);
      new Node([child]);

      expect(child.getData('test')).toBeNull();
    });
  });

  describe('evaluate', () => {
    it('should return default state', () => {
      const node = new Node([]);

      expect(node.evaluate()).toEqual(State.FAILURE);
    });
  });
});
