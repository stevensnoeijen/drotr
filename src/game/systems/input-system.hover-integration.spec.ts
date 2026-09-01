import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { Vector2 } from '~/lib/math/Vector2';
import { findHoverableUnitAt } from './input-system';
import { units } from '~/game/data/units';
import { spawnUnit, resetEntityIdCounter } from '~/game/data/spawn';

/**
 * Integration test: verify hover detection works on red units with real
 * spawn data, blue and red swordsmen as used by the `test` scenario.
 */
describe('Hover detection on red units (swordsmen)', () => {
  it('detects red swordsmen when hovering, with correct stats extracted', () => {
    resetEntityIdCounter();
    const world = new World<Entity>();
    const queries = createQueries(world);

    // Spawn a red swordsman at an arbitrary position
    // Note: units get snapped to cell centers by toWorldPositionCellCenter
    const redUnit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: { x: 360, y: 120 },
    });

    // Verify red unit has hoverable component but NOT selectable
    expect(redUnit.hoverable).toBe(true);
    expect(redUnit.selectable).toBeUndefined();

    // Verify it appears in hoverable query
    expect([...queries.hoverable]).toContain(redUnit);

    // Verify it does NOT appear in selectable query (click protection)
    expect([...queries.selectable]).not.toContain(redUnit);

    // Hover over the red unit at its actual (snapped) position
    const hoveredUnit = findHoverableUnitAt(
      queries,
      new Vector2(redUnit.transform!.position.x, redUnit.transform!.position.y)
    );

    // Verify we found it
    expect(hoveredUnit).toBe(redUnit);
    expect(hoveredUnit?.team).toBe('red');
    expect(hoveredUnit?.unitType).toBe('swordsmen');

    // Verify stats would be available for tooltip (sampling same extraction logic as GameCanvas)
    if (hoveredUnit?.unitType) {
      const stats = {
        type: hoveredUnit.unitType,
        team: hoveredUnit.team,
        damage: units[hoveredUnit.unitType]?.attackDamage,
        accuracy: units[hoveredUnit.unitType]?.accuracy,
        defence: units[hoveredUnit.unitType]?.defence,
        stamina: units[hoveredUnit.unitType]?.stamina,
        speed: units[hoveredUnit.unitType]?.speed,
        range: units[hoveredUnit.unitType]?.range,
      };

      // Verify all expected stats are present
      expect(stats.type).toBe('swordsmen');
      expect(stats.team).toBe('red');
      expect(stats.damage).toBe(3);
      expect(stats.accuracy).toBe(0);
      expect(stats.defence).toBe(4);
      expect(stats.stamina).toBe(9);
      expect(stats.speed).toBe(2);
      expect(stats.range).toBe(1);
    }
  });

  it('detects blue swordsmen when hovering, with correct stats extracted', () => {
    resetEntityIdCounter();
    const world = new World<Entity>();
    const queries = createQueries(world);

    // Spawn a blue swordsman at an arbitrary position
    // Note: units get snapped to cell centers by toWorldPositionCellCenter
    const blueUnit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 120, y: 120 },
    });

    // Verify blue unit has both hoverable AND selectable
    expect(blueUnit.hoverable).toBe(true);
    expect(blueUnit.selectable).toBe(true);

    // Verify it appears in both queries
    expect([...queries.hoverable]).toContain(blueUnit);
    expect([...queries.selectable]).toContain(blueUnit);

    // Hover over the blue unit at its actual (snapped) position
    const hoveredUnit = findHoverableUnitAt(
      queries,
      new Vector2(blueUnit.transform!.position.x, blueUnit.transform!.position.y)
    );

    // Verify we found it
    expect(hoveredUnit).toBe(blueUnit);
    expect(hoveredUnit?.team).toBe('blue');
    expect(hoveredUnit?.unitType).toBe('swordsmen');
  });

  it('hovers over nearest unit when red and blue units overlap', () => {
    resetEntityIdCounter();
    const world = new World<Entity>();
    const queries = createQueries(world);

    // Spawn both units at same location
    const redUnit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: { x: 200, y: 200 },
    });

    const blueUnit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 200, y: 200 },
    });

    // Hover exactly at their center (which is the same snapped position for both)
    const hoveredUnit = findHoverableUnitAt(
      queries,
      new Vector2(redUnit.transform!.position.x, redUnit.transform!.position.y)
    );

    // Should find one of them (the exact one depends on entity order, but the key is
    // that hover detection works for both red and blue equally)
    expect(hoveredUnit).toBeDefined();
    expect([redUnit, blueUnit]).toContain(hoveredUnit);
  });
});
