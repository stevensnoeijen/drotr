import * as fs from 'node:fs';
import * as path from 'node:path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import UnitSprites from './unit-sprites';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** Serves files from `public/` the way the dev server would. */
function servePublic(url: string): Response {
  const file = path.join(
    PUBLIC_DIR,
    url.replace(import.meta.env.BASE_URL, '/').replace(/^\//, '')
  );
  if (!fs.existsSync(file)) {
    return new Response('not found', { status: 404, statusText: 'Not Found' });
  }
  return new Response(fs.readFileSync(file, 'utf8'), { status: 200 });
}

async function render(root: Root, props: { unit?: string; compare?: boolean }) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <UnitSprites {...props} />
      </MemoryRouter>
    );
  });
  // Let the fetch chain settle.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('UnitSprites contact sheet', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // Keep the preview tick from re-rendering the page under test.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => servePublic(url))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows every team × action × direction of the committed swordsmen sheet', async () => {
    await render(root, { unit: 'swordsmen' });
    const rows = container.querySelectorAll('[data-animation]');
    expect(rows).toHaveLength(2 * 4 * 8);
    const attack = container.querySelector(
      '[data-animation="swordsmen.blue.attack.se"]'
    )!;
    // A live preview plus the 12-frame strip.
    expect(attack.querySelectorAll('[data-frame]')).toHaveLength(1 + 12);
    expect(
      attack.querySelector('[data-frame="swordsmen.blue.attack.se_07"]')
    ).not.toBeNull();
  });

  it('zooms each unit out so its whole frame fits the preview box', async () => {
    await render(root, { unit: 'swordsmen' });
    const small = container.querySelector<HTMLElement>(
      '[data-animation="swordsmen.blue.move.s"] [data-frame]'
    )!;
    expect(small.style.width).toBe('96px');
    act(() => root.unmount());
    root = createRoot(container);
    await render(root, { unit: 'knight' });
    const big = container.querySelector<HTMLElement>(
      '[data-animation="knight.blue.move.s"] [data-frame]'
    )!;
    // A 64 px frame is shown at 1.5x rather than 3x, so it is 96 px, not 192.
    expect(big.style.width).toBe('96px');
    expect(big.style.height).toBe('96px');
  });

  it('adds the old sheet frames underneath when comparing', async () => {
    await render(root, { unit: 'swordsmen', compare: true });
    const old = container.querySelector(
      '[data-animation="swordsmen.red.move.s (old)"]'
    )!;
    expect(
      old.querySelector('[data-frame="swordsmen.red.move.south_08"]')
    ).not.toBeNull();
  });

  it('reports a unit whose sheet cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' }))
    );
    await render(root, { unit: 'knight' });
    expect(container.textContent).toContain('Could not load sprites');
  });
});
