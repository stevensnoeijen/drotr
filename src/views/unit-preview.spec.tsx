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

/** Whether an animated sprite on the stage currently shows `frame` first. */
function shows(stage: Container, frame: unknown): boolean {
  return descendants(stage).some((o) => o instanceof AnimatedSprite && o.textures[0] === frame);
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
    let sawBurst = false;
    const burstFrame = (mocks.sheet as Spritesheet).animations['impact-dirt.neutral.move.n'][0];
    for (let t = 0; t < seconds * 1000; t += 16) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      for (const count of frameCounts(stage)) seen.add(count);
      sawBurst ||= shows(stage, burstFrame);
    }
    return { seen, sawBurst };
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

    const { seen, sawBurst } = await run(stage, 3);

    // The one-frame rock in flight, then the dirt burst on landing.
    expect(seen.has(1)).toBe(true);
    expect(sawBurst).toBe(true);
    expect(stage.children).toHaveLength(2);
  });

  it('fires once every 4 seconds: attack from frame 1, launch on frame 2, hold frame 8', async () => {
    const stage = await open('unit=catapult&action=attack&direction=e');
    act(() => checkbox('Attack with projectile')!.click());
    const sheet = mocks.sheet as Spritesheet;
    const rockFrame = sheet.animations['rock.neutral.move.e'][0];
    const attackFrames = sheet.animations['catapult.neutral.attack.e'];
    expect(attackFrames).toHaveLength(8);
    const catapult = () =>
      descendants(stage).find(
        (o): o is AnimatedSprite => o instanceof AnimatedSprite && o.textures[0] === attackFrames[0]
      )!;

    let launches = 0;
    let inFlight = false;
    const frameAtLaunch: number[] = [];
    const heldBetweenShots: number[] = [];
    const frameAtRestart: number[] = [];
    for (let t = 0; t < 9500; t += 16) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      const flying = shows(stage, rockFrame);
      if (flying && !inFlight) {
        launches++;
        frameAtLaunch.push(catapult().currentFrame);
      }
      inFlight = flying;
      // Well after the half-second attack, long before the next shot.
      if (t > 2500 && t < 3500) heldBetweenShots.push(catapult().currentFrame);
      // Just after the second shot starts.
      if (t > 4000 && t < 4100) frameAtRestart.push(catapult().currentFrame);
    }

    // Shots at about 0 s, 4 s and 8 s; a looping attack would fire ~18 times.
    expect(launches).toBe(3);
    // The rock leaves while the second frame (index 1) is showing.
    expect(frameAtLaunch).toEqual([1, 1, 1]);
    // The catapult holds on frame 8 (index 7) instead of looping or idling.
    expect(new Set(heldBetweenShots)).toEqual(new Set([7]));
    // The next cycle restarts from the first frame.
    expect(Math.min(...frameAtRestart)).toBeLessThanOrEqual(1);
  });

  it('draws no dirt burst when the impact is switched off', async () => {
    const stage = await open('unit=catapult&action=attack&direction=e');
    act(() => checkbox('Attack with projectile')!.click());
    act(() => checkbox('Dirt impact')!.click());

    const { seen, sawBurst } = await run(stage, 3);

    expect(seen.has(1)).toBe(true);
    expect(sawBurst).toBe(false);
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
