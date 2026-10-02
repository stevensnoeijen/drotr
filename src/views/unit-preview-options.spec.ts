import { describe, expect, it } from 'vitest';

import type { UnitManifest } from '~/game/render/sprites/unit-manifest';

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
