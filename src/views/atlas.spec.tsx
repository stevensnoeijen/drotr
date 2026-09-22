import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPcx } from '~/test/pcx-fixture';
import { ATLAS_TILE_SIZE } from '~/lib/art';

import Atlas, { CD_URL_PREFIX } from './atlas';

/** A 2x1 tile sheet whose right-hand tile is entirely the colour key. */
function fixtureSheet(): Uint8Array {
  const width = ATLAS_TILE_SIZE * 2;
  const height = ATLAS_TILE_SIZE;
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = ATLAS_TILE_SIZE; x < width; x++) {
      indices[y * width + x] = 37;
    }
  }
  const palette = new Uint8Array(768);
  palette[37 * 3] = 0;
  palette[37 * 3 + 1] = 251;
  palette[37 * 3 + 2] = 192;
  return buildPcx({ width, height, indices, palette });
}

function renderAtlas(root: Root) {
  act(() => {
    root.render(
      <MemoryRouter>
        <Atlas file="ART/TEST.ART" />
      </MemoryRouter>
    );
  });
}

/** Lets the fetch promise chain inside the component settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Atlas', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('fetches the art file from the CD data prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fixtureSheet().buffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAtlas(root);
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(`${CD_URL_PREFIX}ART/TEST.ART`);
  });

  it('reports the decoded geometry once loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => fixtureSheet().buffer,
      })
    );

    renderAtlas(root);
    await flush();

    expect(container.textContent).toContain('80x40');
    expect(container.textContent).toContain(`${ATLAS_TILE_SIZE}px`);
    // Two 40px tiles across, one row: two complete tiles, half of them the
    // colour key and so fully transparent.
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('50.0%');
  });

  it('explains how to supply the data when the file is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    );

    renderAtlas(root);
    await flush();

    expect(container.textContent).toContain("Couldn't load");
    expect(container.textContent).toContain('404');
    expect(container.textContent).toContain('.cd/');
    expect(container.textContent).toContain('DROTR_CD_DIR');
  });

  it('surfaces a decode failure rather than rendering a blank page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array(2048).buffer,
      })
    );

    renderAtlas(root);
    await flush();

    expect(container.textContent).toContain("Couldn't load");
    expect(container.textContent).toContain('not a PCX image');
  });
});
