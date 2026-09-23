import { Assets, Container, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';

import type { MapTileset, ParsedMap } from '~/game/map/load-tiled-map';
import { decodeGid, resolveGid, tileFrame, tileOrientation, type DecodedGid } from '~/game/map/tile-gid';
import {
  chunkCells,
  chunkRangesEqual,
  createChunkGrid,
  DEFAULT_CHUNK_SIZE,
  isChunkVisible,
  visibleChunkRange,
  type ChunkGrid,
  type ChunkRange,
  type WorldRect,
} from './tile-chunks';

/** A resolved tile: the texture to draw and the tileset it was cut from. */
export interface TileTexture {
  texture: Texture;
  tileset: MapTileset;
}

/**
 * Lazily cuts tile textures out of their tilesets' images, one per gid
 * actually drawn, and reuses them for every cell showing that gid. Every
 * texture shares its tileset's single image source, so Pixi batches a whole
 * chunk into as few draw calls as there are tileset images.
 */
export class TileTextureCache {
  private readonly textures = new Map<number, TileTexture | null>();

  constructor(
    private readonly tilesets: readonly MapTileset[],
    /** Loaded image source per {@link MapTileset.imageUrl}. */
    private readonly sources: ReadonlyMap<string, TextureSource>
  ) {}

  /**
   * The texture for a flag-free gid, or `undefined` for the empty gid 0, a
   * gid no tileset covers, or one whose tileset image isn't loaded — all of
   * which draw nothing rather than throw.
   */
  public get(gid: number): TileTexture | undefined {
    const cached = this.textures.get(gid);
    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const resolved = resolveGid(gid, this.tilesets);
    const source = resolved && this.sources.get(resolved.tileset.imageUrl);
    let entry: TileTexture | null = null;
    if (resolved && source) {
      const frame = tileFrame(resolved.tileset, resolved.localId);
      // A frame reaching past the image (a tileset whose tilecount
      // overstates its image) would make Pixi throw; treat it as unknown.
      if (frame.x + frame.width <= source.width && frame.y + frame.height <= source.height) {
        entry = {
          tileset: resolved.tileset,
          texture: new Texture({
            source,
            frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
          }),
        };
      }
    }
    this.textures.set(gid, entry);
    return entry ?? undefined;
  }

  /** Destroys the per-gid textures (not the shared image sources). */
  public destroy(): void {
    for (const entry of this.textures.values()) {
      entry?.texture.destroy(false);
    }
    this.textures.clear();
  }
}

/**
 * Positions a tile sprite to fill map cell `(x, y)` exactly: anchored at
 * its centre so flips and the diagonal-flip rotation turn it in place, and
 * scaled from the tileset's tile size to the map's cell size (the engine's
 * grid is authoritative; a tileset whose tiles are larger or smaller than
 * the map's is fitted to it rather than overhanging neighbouring cells).
 */
function placeTileSprite(
  sprite: Sprite,
  x: number,
  y: number,
  cellSize: number,
  flags: Pick<DecodedGid, 'flippedHorizontally' | 'flippedVertically' | 'flippedDiagonally'>
): void {
  const orientation = tileOrientation(flags);
  sprite.anchor.set(0.5);
  sprite.position.set((x + 0.5) * cellSize, (y + 0.5) * cellSize);
  sprite.rotation = orientation.rotation;
  sprite.scale.set(
    (orientation.scaleX * cellSize) / sprite.texture.frame.width,
    (orientation.scaleY * cellSize) / sprite.texture.frame.height
  );
}

export interface MapRenderSystemOptions {
  map: ParsedMap;
  /** Resolves the map's tile-layer gids to textures. */
  tileTextures: TileTextureCache;
  /** Tiles per chunk side. */
  chunkSize?: number;
}

/**
 * Draws a map's terrain into {@link container}: every visible tile layer,
 * each gid resolved through the map's tilesets to its tile's art.
 *
 * Tiles are grouped into fixed-size chunks, one container each, and
 * {@link cull} hides every chunk outside the camera's view, so a full-size
 * county map only draws the handful of chunks on screen.
 */
export class MapRenderSystem {
  /** Terrain root; add it beneath everything else in the world. */
  public readonly container = new Container();

  private readonly grid: ChunkGrid;
  /** Chunk containers, row-major by chunk (`row * grid.columns + column`). */
  private chunks: Container[] = [];
  private lastRange: ChunkRange | undefined;

  constructor(private readonly options: MapRenderSystemOptions) {
    this.grid = createChunkGrid(options.map.width, options.map.height, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
    this.build();
  }

  /**
   * Shows only the chunks overlapping `view` (world pixels), grown by one
   * tile so a chunk is already drawn as it scrolls in. Only touches chunk
   * visibility when the visible range actually changes, so calling it every
   * frame is cheap.
   */
  public cull(view: WorldRect): void {
    const range = visibleChunkRange(this.grid, this.options.map.tileSize, view, this.options.map.tileSize);
    if (chunkRangesEqual(range, this.lastRange) && this.lastRange !== undefined) {
      return;
    }
    this.lastRange = range;
    for (let row = 0; row < this.grid.rows; row++) {
      for (let column = 0; column < this.grid.columns; column++) {
        this.chunks[row * this.grid.columns + column].visible = isChunkVisible(range, column, row);
      }
    }
  }

  /** Destroys every chunk and its sprites, and the per-gid textures. */
  public dispose(): void {
    this.destroyChunks();
    this.options.tileTextures.destroy();
    this.container.destroy({ children: true });
  }

  private destroyChunks(): void {
    for (const chunk of this.chunks) {
      chunk.destroy({ children: true });
    }
    this.chunks = [];
    this.lastRange = undefined;
  }

  private build(): void {
    for (let row = 0; row < this.grid.rows; row++) {
      for (let column = 0; column < this.grid.columns; column++) {
        const chunk = new Container();
        this.fillChunk(chunk, column, row);
        this.chunks.push(chunk);
        this.container.addChild(chunk);
      }
    }
  }

  /** Every visible tile layer's sprites for this chunk, back to front. */
  private fillChunk(chunk: Container, column: number, row: number): void {
    const { map, tileTextures } = this.options;
    const { x0, y0, x1, y1 } = chunkCells(this.grid, column, row);

    for (const layer of map.tileLayers) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const decoded = decodeGid(layer.data[y * map.width + x] ?? 0);
          const tile = tileTextures.get(decoded.gid);
          if (!tile) {
            continue;
          }
          const sprite = new Sprite(tile.texture);
          placeTileSprite(sprite, x, y, map.tileSize, decoded);
          chunk.addChild(sprite);
        }
      }
    }
  }
}

async function loadNearestSource(url: string): Promise<TextureSource> {
  const texture = await Assets.load<Texture>(url);
  // Nearest-neighbour sampling: tiles are packed edge to edge with no
  // spacing, so linear filtering at fractional zoom scales would bleed
  // neighbouring tiles' pixels in along every edge as visible seams.
  texture.source.scaleMode = 'nearest';
  return texture.source;
}

/**
 * Loads every tileset image a map references and builds a
 * {@link MapRenderSystem} for it.
 */
export async function createMapRenderSystem(map: ParsedMap): Promise<MapRenderSystem> {
  const imageUrls = [...new Set(map.tilesets.map((tileset) => tileset.imageUrl))];
  const tilesetSources = await Promise.all(imageUrls.map(loadNearestSource));
  const sources = new Map(imageUrls.map((url, i) => [url, tilesetSources[i]]));

  return new MapRenderSystem({ map, tileTextures: new TileTextureCache(map.tilesets, sources) });
}
