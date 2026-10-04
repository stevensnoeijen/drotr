import * as fs from 'node:fs';
import * as path from 'node:path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { AnimatedSprite, Container, type Spritesheet } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { committedAtlas } from '~/test/unit-sprites-fixture';
import UnitPreview from './unit-preview';

const mocks = vi.hoisted(() => ({
  sheet: undefined as unknown,
  stages: [] as unknown[],
}));

// The real Pixi scene graph and ticker, but no WebGL: `Application` only
// hands out a stage, and the atlas is the committed one cut from a blank
// texture.
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class Application {
    stage = new actual.Container();
    canvas = document.createElement('canvas');
    constructor() {
      mocks.stages.push(this.stage);
    }
    async init() {}
    destroy() {}
  }
  return {
    ...actual,
    Application,
    Assets: { load: vi.fn(async () => mocks.sheet) },
  };
});

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function servePublic(url: string): Response {
  const file = path.join(
    PUBLIC_DIR,
    url.replace(import.meta.env.BASE_URL, '/').replace(/^\//, '')
  );
  return fs.existsSync(file)
    ? new Response(fs.readFileSync(file, 'utf8'), { status: 200 })
    : new Response('not found', { status: 404, statusText: 'Not Found' });
}

/** Every display object below `root`, depth first. */
function descendants(root: Container): Container[] {
  return root.children.flatMap((child) => [child as Container, ...descendants(child as Container)]);
}

/** Textures counts of every animated sprite currently on the stage. */
function frameCounts(stage: Container): number[] {
  return descendants(stage)
    .filter((o): o is AnimatedSprite => o instanceof AnimatedSprite)
    .map((s) => s.textures.length);
}

describe('UnitPreview catapult firing demo', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.sheet = committedAtlas() as Spritesheet;
    mocks.stages.length = 0;
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => servePublic(url)));
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

  async function open(query: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/unit-preview?${query}`]}>
          <UnitPreview />
        </MemoryRouter>
      );
    });
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    return mocks.stages[mocks.stages.length - 1] as Container;
  }

  const checkbox = (label: string) =>
    [...container.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))
      ?.querySelector('input') as HTMLInputElement | undefined;

  /** Runs the page for `seconds` of fake time, collecting what is on stage. */
  async function run(stage: Container, seconds: number) {
    const seen = new Set<number>();
    let peakEightFrame = 0;
    for (let t = 0; t < seconds * 1000; t += 16) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      const counts = frameCounts(stage);
      for (const count of counts) seen.add(count);
      peakEightFrame = Math.max(peakEightFrame, counts.filter((c) => c === 8).length);
    }
    return { seen, peakEightFrame };
  }

  it('keeps the rock and the dirt burst selectable as units of their own', async () => {
    await open('unit=rock');

    const unit = container.querySelector('select[aria-label="Unit"]') as HTMLSelectElement;
    const options = [...unit.options].map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(['catapult', 'rock', 'impact-dirt']));
    expect(unit.value).toBe('rock');
    // No catapult-only controls on a standalone rock.
    expect(checkbox('Attack with projectile')).toBeUndefined();
  });

  it('offers the projectile checkboxes for the catapult only', async () => {
    await open('unit=catapult&action=attack');
    expect(checkbox('Attack with projectile')).toBeDefined();
    expect(checkbox('Dirt impact')).toBeDefined();
  });

  it('shows no demo until the projectile checkbox is on', async () => {
    const stage = await open('unit=catapult&action=attack&direction=e');
    const { seen } = await run(stage, 1.5);

    // Just the catapult's own 8-frame attack: no rock, no dirt burst.
    expect([...seen]).toEqual([8]);
    expect(stage.children).toHaveLength(1);
  });

  it('fires a rock from the attacking catapult and plays the dirt burst where it lands', async () => {
    const stage = await open('unit=catapult&action=attack&direction=e');
    act(() => checkbox('Attack with projectile')!.click());

    const { seen, peakEightFrame } = await run(stage, 3);

    // The one-frame rock in flight, then the 8-frame dirt burst on landing
    // next to the catapult's own 8-frame attack.
    expect(seen.has(1)).toBe(true);
    expect(peakEightFrame).toBe(2);
    expect(stage.children).toHaveLength(2);
  });

  it('draws no dirt burst when the impact is switched off', async () => {
    const stage = await open('unit=catapult&action=attack&direction=e');
    act(() => checkbox('Attack with projectile')!.click());
    act(() => checkbox('Dirt impact')!.click());

    const { seen, peakEightFrame } = await run(stage, 3);

    expect(seen.has(1)).toBe(true);
    // Only the catapult's own 8 frames: the burst never appears.
    expect(peakEightFrame).toBe(1);
  });

  it('removes the demo layer when the projectile checkbox is switched off', async () => {
    const stage = await open('unit=catapult&action=attack&direction=e');
    act(() => checkbox('Attack with projectile')!.click());
    await run(stage, 1);
    expect(stage.children).toHaveLength(2);

    act(() => checkbox('Attack with projectile')!.click());

    expect(stage.children).toHaveLength(1);
  });
});
