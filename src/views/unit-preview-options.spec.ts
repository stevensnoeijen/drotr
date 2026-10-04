import { describe, expect, it } from 'vitest';

import { DIRECTIONS, animationKey } from '~/game/render/sprites/animation-key';
import type { UnitManifest } from '~/game/render/sprites/unit-manifest';
import { committedAtlasData, committedManifest } from '~/test/unit-sprites-fixture';

import {
  animationOptions,
  atlasUnits,
  previewZoom,
  resolveSelection,
  selectionFromParams,
} from './unit-preview-options';

const swordsmen: UnitManifest = {
  frameSize: [32, 32],
  anchor: [0.5, 0.5],
  teams: ['blue', 'red'],
  actions: {
    dead: { frames: 4, fps: 15, loop: false, holdLast: true },
    idle: { frames: 1, fps: 0, loop: false },
    move: { frames: 8, fps: 15, loop: true },
  },
};

const knight: UnitManifest = {
  frameSize: [40, 40],
  anchor: [0.5, 0.5],
  teams: ['red'],
  actions: { attack: { frames: 6, fps: 12, loop: false } },
};

describe('atlasUnits', () => {
  it('finds every unit with animations, in unit-type order', () => {
    expect(
      atlasUnits([
        'knight.red.attack.n',
        'swordsmen.blue.move.e',
        'swordsmen.red.idle.s',
        'not-a-key',
        'dragon.red.move.n',
      ])
    ).toEqual(['swordsmen', 'knight']);
  });

  it('returns nothing for an empty atlas', () => {
    expect(atlasUnits([])).toEqual([]);
  });
});

describe('animationOptions', () => {
  it('offers only the declared teams and actions, actions in canonical order', () => {
    expect(animationOptions(swordsmen)).toEqual({
      teams: ['blue', 'red'],
      actions: ['idle', 'move', 'dead'],
      directions: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'],
    });
  });
});

describe('resolveSelection', () => {
  const units = ['swordsmen', 'knight'] as const;
  const manifests = { swordsmen, knight };

  it('keeps a valid request and defaults loop to the manifest', () => {
    expect(
      resolveSelection(units, manifests, {
        unit: 'swordsmen',
        team: 'red',
        action: 'move',
        direction: 'sw',
      })
    ).toEqual({
      unit: 'swordsmen',
      team: 'red',
      action: 'move',
      direction: 'sw',
      loop: true,
    });
  });

  it('loops attack by default but lets an explicit loop override it', () => {
    const request = { unit: 'knight', action: 'attack' } as const;
    expect(resolveSelection(units, manifests, request)?.loop).toBe(true);
    expect(
      resolveSelection(units, manifests, { ...request, loop: false })?.loop
    ).toBe(false);
  });

  it('keeps dead playing once by default', () => {
    expect(resolveSelection(units, manifests, { action: 'dead' })?.loop).toBe(
      false
    );
  });

  it('falls back to the first option for anything the unit lacks', () => {
    expect(
      resolveSelection(units, manifests, {
        unit: 'knight',
        team: 'blue',
        action: 'move',
        direction: 'up' as never,
        loop: true,
      })
    ).toEqual({
      unit: 'knight',
      team: 'red',
      action: 'attack',
      direction: 'n',
      loop: true,
    });
  });

  it('picks the first unit when none or an unknown one is requested', () => {
    expect(resolveSelection(units, manifests, {})?.unit).toBe('swordsmen');
    expect(
      resolveSelection(units, manifests, { unit: 'cannon' as never })?.unit
    ).toBe('swordsmen');
  });

  it('gives nothing when there are no units or no manifest yet', () => {
    expect(resolveSelection([], manifests, {})).toBeUndefined();
    expect(resolveSelection(['swordsmen'], {}, {})).toBeUndefined();
  });
});

describe('selectionFromParams', () => {
  it('reads the requested selection from the URL', () => {
    expect(
      selectionFromParams(
        new URLSearchParams(
          'unit=swordsmen&team=blue&action=attack&direction=se&loop=0'
        )
      )
    ).toEqual({
      unit: 'swordsmen',
      team: 'blue',
      action: 'attack',
      direction: 'se',
      loop: false,
    });
  });

  it('leaves out missing parameters and ignores a malformed loop', () => {
    expect(selectionFromParams(new URLSearchParams('loop=yes'))).toEqual({});
  });
});

describe('previewZoom', () => {
  it('keeps the 8x zoom for 32 px frames', () => {
    expect(previewZoom(384, [32, 32])).toBe(8);
  });

  it('zooms 64 px frames out so the whole frame fits the canvas', () => {
    const zoom = previewZoom(384, [64, 64]);
    expect(zoom).toBe(4);
    expect(64 * zoom).toBeLessThanOrEqual(384);
  });

  it('never drops below 1x', () => {
    expect(previewZoom(384, [1000, 1000])).toBe(1);
  });
});

describe('per-action directions', () => {
  const ram: UnitManifest = {
    frameSize: [64, 64],
    anchor: [0.5, 0.5],
    teams: ['red'],
    actions: {
      move: { frames: 6, fps: 6, loop: true },
      attack: { frames: 8, fps: 16, loop: false, directions: ['n'] },
    },
  };

  it('offers only the directions of the chosen action', () => {
    expect(animationOptions(ram, 'attack').directions).toEqual(['n']);
    expect(animationOptions(ram, 'move').directions).toHaveLength(8);
    expect(animationOptions(ram).directions).toHaveLength(8);
  });

  it('falls back to an available direction when the action lacks the requested one', () => {
    const selection = resolveSelection(['juggernaut'], { juggernaut: ram }, {
      unit: 'juggernaut',
      action: 'attack',
      direction: 'sw',
    });
    expect(selection?.direction).toBe('n');
  });

  it('keeps the requested direction for an action that has it', () => {
    const selection = resolveSelection(['juggernaut'], { juggernaut: ram }, {
      unit: 'juggernaut',
      action: 'move',
      direction: 'sw',
    });
    expect(selection?.direction).toBe('sw');
  });
});

describe('a projectile like the bolt', () => {
  // Neutral, move only, one still frame per direction, in all eight.
  const bolt: UnitManifest = {
    frameSize: [14, 14],
    anchor: [0.5, 0.5],
    teams: ['neutral'],
    actions: { move: { frames: 1, fps: 0, loop: false } },
  };

  it('offers the neutral team, the move action and all eight directions', () => {
    expect(animationOptions(bolt)).toEqual({
      teams: ['neutral'],
      actions: ['move'],
      directions: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'],
    });
  });

  it('resolves any request to its neutral move, keeping the requested direction', () => {
    for (const direction of DIRECTIONS) {
      expect(
        resolveSelection(['bolt'], { bolt }, { unit: 'bolt', team: 'red', action: 'attack', direction })
      ).toEqual({ unit: 'bolt', team: 'neutral', action: 'move', direction, loop: false });
    }
  });

  it('shows the small frame at the 8x zoom cap', () => {
    expect(previewZoom(384, bolt.frameSize)).toBe(8);
  });

  it('is listed from the committed atlas, with a frame of its own for every direction', () => {
    const animations = committedAtlasData().animations!;
    expect(atlasUnits(Object.keys(animations))).toContain('bolt');

    const manifest = committedManifest('bolt');
    const frames = DIRECTIONS.map((direction) => {
      const selection = resolveSelection(['bolt'], { bolt: manifest }, { unit: 'bolt', direction })!;
      const names = animations[
        animationKey(selection.unit, selection.team, selection.action, selection.direction)
      ];
      expect(names).toHaveLength(1);
      return names[0];
    });
    // Changing direction changes the frame shown.
    expect(new Set(frames).size).toBe(DIRECTIONS.length);
  });
});

describe('the rock', () => {
  it('is listed from the committed atlas, as a neutral move in every direction', () => {
    const animations = committedAtlasData().animations!;
    expect(atlasUnits(Object.keys(animations))).toContain('rock');

    const manifest = committedManifest('rock');
    for (const direction of DIRECTIONS) {
      const selection = resolveSelection(['rock'], { rock: manifest }, { unit: 'rock', direction })!;
      expect(selection).toMatchObject({ unit: 'rock', team: 'neutral', action: 'move', direction });
      const names =
        animations[animationKey(selection.unit, selection.team, selection.action, selection.direction)];
      expect(names).toHaveLength(1);
    }
  });
});

describe('the impact-dirt effect', () => {
  it('is listed from the committed atlas, as an 8-frame neutral move', () => {
    const animations = committedAtlasData().animations!;
    expect(atlasUnits(Object.keys(animations))).toContain('impact-dirt');

    const manifest = committedManifest('impact-dirt');
    const selection = resolveSelection(['impact-dirt'], { 'impact-dirt': manifest }, { unit: 'impact-dirt' })!;
    expect(selection).toMatchObject({ unit: 'impact-dirt', team: 'neutral', action: 'move' });
    const names =
      animations[animationKey(selection.unit, selection.team, selection.action, selection.direction)];
    expect(names).toHaveLength(8);
  });
});
