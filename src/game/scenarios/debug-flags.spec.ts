import { describe, expect, it } from 'vitest';

import { parseDebugFlags, serializeDebugFlags } from './debug-flags';

describe('parseDebugFlags', () => {
  it('parses a single flag', () => {
    expect(parseDebugFlags('grid')).toEqual(new Set(['grid']));
  });

  it('parses a comma-separated list', () => {
    expect(parseDebugFlags('grid,health')).toEqual(new Set(['grid', 'health']));
  });

  it('ignores unknown flags', () => {
    expect(parseDebugFlags('grid,bogus')).toEqual(new Set(['grid']));
  });

  it('trims whitespace around flags', () => {
    expect(parseDebugFlags(' grid , health ')).toEqual(
      new Set(['grid', 'health'])
    );
  });

  it('returns an empty set for null', () => {
    expect(parseDebugFlags(null)).toEqual(new Set());
  });

  it('returns an empty set for an empty string', () => {
    expect(parseDebugFlags('')).toEqual(new Set());
  });

  it('parses the paths flag', () => {
    expect(parseDebugFlags('paths')).toEqual(new Set(['paths']));
  });
});

describe('serializeDebugFlags', () => {
  it('serializes a single flag', () => {
    expect(serializeDebugFlags(new Set(['grid']))).toBe('grid');
  });

  it('serializes multiple flags in a stable, canonical order', () => {
    expect(serializeDebugFlags(new Set(['health', 'grid']))).toBe(
      'grid,health'
    );
  });

  it('serializes an empty set to an empty string', () => {
    expect(serializeDebugFlags(new Set())).toBe('');
  });

  it('round-trips through parseDebugFlags', () => {
    const flags = parseDebugFlags('health,grid');
    expect(parseDebugFlags(serializeDebugFlags(flags))).toEqual(flags);
  });
});
