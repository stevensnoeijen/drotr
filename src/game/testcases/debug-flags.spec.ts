import { describe, expect, it } from 'vitest';

import { parseDebugFlags } from './debug-flags';

describe('parseDebugFlags', () => {
  it('parses a single flag', () => {
    expect(parseDebugFlags('grid')).toEqual(new Set(['grid']));
  });

  it('parses a comma-separated list', () => {
    expect(parseDebugFlags('grid,paths')).toEqual(new Set(['grid', 'paths']));
  });

  it('ignores unknown flags', () => {
    expect(parseDebugFlags('grid,bogus')).toEqual(new Set(['grid']));
  });

  it('trims whitespace around flags', () => {
    expect(parseDebugFlags(' grid , paths ')).toEqual(
      new Set(['grid', 'paths'])
    );
  });

  it('returns an empty set for null', () => {
    expect(parseDebugFlags(null)).toEqual(new Set());
  });

  it('returns an empty set for an empty string', () => {
    expect(parseDebugFlags('')).toEqual(new Set());
  });
});
