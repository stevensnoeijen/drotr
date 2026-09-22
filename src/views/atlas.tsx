import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import {
  ATLAS_TILE_SIZE,
  decodePcx,
  tileColumns,
  tileCount,
  tileRect,
  toRgba,
  type PcxImage,
  type RgbaPixels,
} from '~/lib/art';

/** Where the dev server exposes the local copy of the CD data. */
export const CD_URL_PREFIX = `${import.meta.env.BASE_URL}cd/`;

/** The art file the viewer opens unless `?art=` names another. */
const DEFAULT_ART_FILE = 'ART/BATTLE.ART';

/**
 * The highest tile index the county `.MAP` files reference. Reading the
 * sheet as 64px tiles cannot reach the last twelve of these, which is what
 * made the earlier PNG conversion look truncated — so the viewer calls them
 * out explicitly.
 */
const HIGHEST_MAP_TILE_INDEX = 1471;
const HIGHLIGHT_FROM = 1460;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; image: PcxImage; rgba: RgbaPixels };

/** A settled result, tagged with the file it came from. */
interface Settled {
  readonly file: string;
  readonly state: LoadState;
}

function useArtFile(file: string): LoadState {
  const [settled, setSettled] = useState<Settled | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const setState = (state: LoadState) => setSettled({ file, state });

    fetch(`${CD_URL_PREFIX}${file}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `${response.status} ${response.statusText || 'request failed'}`
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const image = decodePcx(bytes);
        return { image, rgba: toRgba(image) };
      })
      .then(({ image, rgba }) => {
        if (!cancelled) {
          setState({ status: 'ready', image, rgba });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  // Derived rather than reset in the effect: switching files shows the
  // loading state on the very first render after the change, without a
  // state write during the effect that would render the stale file twice.
  return settled?.file === file ? settled.state : { status: 'loading' };
}

/**
 * Paints the decoded sheet onto a canvas, optionally overlaying the tile
 * grid and highlighting the tiles that a 64px reading of the sheet would
 * miss.
 */
function AtlasCanvas({
  image,
  rgba,
  showGrid,
  highlightHighTiles,
  zoom,
}: {
  image: PcxImage;
  rgba: RgbaPixels;
  showGrid: boolean;
  highlightHighTiles: boolean;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    // jsdom has no canvas implementation, so this is null under test.
    if (!context) {
      return;
    }

    canvas.width = image.width;
    canvas.height = image.height;
    context.clearRect(0, 0, image.width, image.height);
    context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);

    if (showGrid) {
      context.strokeStyle = 'rgba(255, 0, 255, 0.35)';
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x <= image.width; x += ATLAS_TILE_SIZE) {
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, image.height);
      }
      for (let y = 0; y <= image.height; y += ATLAS_TILE_SIZE) {
        context.moveTo(0, y + 0.5);
        context.lineTo(image.width, y + 0.5);
      }
      context.stroke();
    }

    if (highlightHighTiles) {
      context.strokeStyle = 'rgba(16, 185, 129, 0.9)';
      context.lineWidth = 2;
      for (let i = HIGHLIGHT_FROM; i <= HIGHEST_MAP_TILE_INDEX; i++) {
        const rect = tileRect(i, image.width);
        context.strokeRect(
          rect.x + 1,
          rect.y + 1,
          rect.width - 2,
          rect.height - 2
        );
      }
    }
  }, [image, rgba, showGrid, highlightHighTiles]);

  return (
    <canvas
      ref={canvasRef}
      // A checkerboard behind the canvas makes the colour-key-to-alpha
      // conversion visible: anything that stayed teal would read as solid.
      className="origin-top-left [image-rendering:pixelated]"
      style={{
        width: image.width * zoom,
        height: image.height * zoom,
        backgroundColor: '#1a1a1a',
        backgroundImage:
          'linear-gradient(45deg, #2b2b2b 25%, transparent 25%), linear-gradient(-45deg, #2b2b2b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2b2b2b 75%), linear-gradient(-45deg, transparent 75%, #2b2b2b 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
      }}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <span className="font-mono text-sm text-white">{value}</span>
    </div>
  );
}

/**
 * Visual inspection page for the decoded tile atlas, reached via
 * `#/game?case=atlas`.
 *
 * It decodes the real `.ART` in the browser with the same code the rest of
 * the pipeline uses, so what renders here is exactly what a consumer of the
 * decoder gets — including transparency.
 */
export default function Atlas({ file = DEFAULT_ART_FILE }: { file?: string }) {
  const state = useArtFile(file);
  const [showGrid, setShowGrid] = useState(false);
  const [highlightHighTiles, setHighlightHighTiles] = useState(false);
  const [zoom, setZoom] = useState(1);

  const summary = useMemo(() => {
    if (state.status !== 'ready') {
      return undefined;
    }
    const { image, rgba } = state;
    let transparent = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] === 0) {
        transparent++;
      }
    }
    return {
      columns: tileColumns(image.width),
      tiles: tileCount(image.width, image.height),
      transparent,
      pixels: image.width * image.height,
    };
  }, [state]);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-6 border-b border-neutral-700 bg-neutral-900/95 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-white">Tile atlas</h1>
          <p className="font-mono text-xs text-neutral-400">{file}</p>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-6">
            <Stat
              label="size"
              value={
                state.status === 'ready'
                  ? `${state.image.width}x${state.image.height}`
                  : ''
              }
            />
            <Stat label="tile" value={`${ATLAS_TILE_SIZE}px`} />
            <Stat label="columns" value={String(summary.columns)} />
            <Stat label="complete tiles" value={String(summary.tiles)} />
            <Stat
              label="transparent"
              value={`${((summary.transparent / summary.pixels) * 100).toFixed(1)}%`}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => setShowGrid(event.target.checked)}
            />
            tile grid
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={highlightHighTiles}
              onChange={(event) => setHighlightHighTiles(event.target.checked)}
            />
            tiles {HIGHLIGHT_FROM}-{HIGHEST_MAP_TILE_INDEX}
          </label>
          <label className="flex items-center gap-2 text-sm">
            zoom
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span className="font-mono">{zoom}x</span>
          </label>
          <Link
            to="/"
            className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-600"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="p-6">
        {state.status === 'loading' && <p>Decoding {file}…</p>}

        {state.status === 'error' && (
          <div className="max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold text-white">
              Couldn't load {file}
            </h2>
            <p className="font-mono text-sm text-red-400">{state.message}</p>
            <p className="text-sm text-neutral-300">
              The original game data is not committed to this repository. Put a
              copy of the CD's files under <code>.cd/</code> in the project root
              (so this file is at <code>.cd/{file}</code>), or point{' '}
              <code>DROTR_CD_DIR</code> at wherever you keep it, then reload. It
              is only served by the dev server, never by a production build.
            </p>
          </div>
        )}

        {state.status === 'ready' && (
          <AtlasCanvas
            image={state.image}
            rgba={state.rgba}
            showGrid={showGrid}
            highlightHighTiles={highlightHighTiles}
            zoom={zoom}
          />
        )}
      </main>
    </div>
  );
}
