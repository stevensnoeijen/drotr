import { describe, expect, it } from 'vitest';

import {
  COUNTY_NAMES,
  countyMapCdPath,
  countyTiledMapFileName,
  isCountyName,
} from './county-names';

describe('county names', () => {
  it('lists the 12 counties, without BUILDING', () => {
    expect(COUNTY_NAMES).toHaveLength(12);
    expect(isCountyName('FAGARAS')).toBe(true);
    expect(isCountyName('BUILDING')).toBe(false);
    expect(isCountyName('fagaras')).toBe(false);
  });

  it('maps a county to its source and output files', () => {
    expect(countyMapCdPath('FAGARAS')).toEqual('COUNTIES/FAGARAS.MAP');
    expect(countyTiledMapFileName('FAGARAS')).toEqual('fagaras.tmj');
  });
});
