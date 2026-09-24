import { Assets, Container, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';

import type { MapTileset, ParsedMap } from '~/game/map/load-tiled-map';
import { decodeGid, resolveGid, tileFrame } from '~/game/map/tile-gid';
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

/**
 * Lazily cuts tile textures out of the tileset's image, one per gid
 * actually drawn, and reuses them for every cell showing that gid. Every
 * texture shares the one image source, so Pixi can batch a whole chunk into
 * a single draw call.
 */
export class TileTextureCache {
  private readonly textures = new Map<number, Texture | null>();

  constructor(
    private readonly tileset: MapTileset,
    /** The tileset's loaded image. */
    private readonly source: TextureSource
  ) {}

  /**
   * The texture for a flag-free gid, or `undefined` for the empty gid 0 or a
   * gid the tileset doesn't cover (or whose frame falls outside its image) —
   * all of which draw nothing rather than throw.
   */
  public get(gid: number): Texture | undefined {
    const cached = this.textures.get(gid);
    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const localId = resolveGid(gid, this.tileset);
    let texture: Texture | null = null;
    if (localId !== undefined) {
      const frame = tileFrame(this.tileset, localId);
      // A frame reaching past the image (a tileset whose tilecount
      // overstates its image) would make Pixi throw; treat it as unknown.
      if (frame.x + frame.width <= this.source.width && frame.y + frame.height <= this.source.height) {
        texture = new Texture({
          source: this.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        });
      }
    }
    this.textures.set(gid, texture);
    return texture ?? undefined;
  }

  /** Destroys the per-gid textures (not the shared image source). */
  public destroy(): void {
    for (const texture of this.textures.values()) {
      texture?.destroy(false);
    }
    this.textures.clear();
  }
}

/**
 * Positions a tile sprite to fill map cell `(x, y)` exactly, scaled from the
 * tileset's tile size to the map's cell size (the engine's grid is
 * authoritative; a tileset whose tiles are larger or smaller than the
 * map's is fitted to it rather than overhanging neighbouring cells).
 */
function placeTileSprite(sprite: Sprite, x: number, y: number, cellSize: number): void {
  sprite.position.set(x * cellSize, y * cellSize);
  sprite.scale.set(cellSize / sprite.texture.frame.width, cellSize / sprite.texture.frame.height);
}

export interface MapRenderSystemOptions {
  map: ParsedMap;
  /** Resolves the map's tile-layer gids to textures. */
  tileTextures: TileTextureCache;
  /** Tiles per chunk side. */
  chunkSize?: number;
}

/**
 * Draws a map's terrain into {@link container}: every tile layer, each gid
 * resolved through the map's tileset to its tile's art.
 *
 * Tiles are grouped into fixed-size chunks, one container each, and
 * {@link cull} hides every chunk outside the camera's view, so a full-size
 * county map only draws the handful of chunks on screen. Inside a chunk,
 * each tile layer gets its own container, back to front, so a layer can be
 * shown or hidden ({@link setLayerVisibility}) without rebuilding anything.
 * A layer hidden in the map starts out built but invisible. Visibility is
 * display only; it never touches the map's collision.
 */
export class MapRenderSystem {
  /** Terrain root; add it beneath everything else in the world. */
  public readonly container = new Container();

  private readonly grid: ChunkGrid;
  /** Chunk containers, row-major by chunk (`row * grid.columns + column`). */
  private chunks: Container[] = [];
  /**
   * Per tile layer (same order as `map.tileLayers`), that layer's container
   * in every chunk, in chunk order.
   */
  private layerContainers: Container[][] = [];
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

  /**
   * Shows or hides each tile layer, by index into `map.tileLayers`. A
   * missing entry leaves that layer as it is.
   */
  public setLayerVisibility(visibility: readonly boolean[]): void {
    this.layerContainers.forEach((containers, layer) => {
      const visible = visibility[layer];
      if (visible === undefined) {
        return;
      }
      for (const container of containers) {
        container.visible = visible;
      }
    });
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
    this.layerContainers = [];
    this.lastRange = undefined;
  }

  private build(): void {
    this.layerContainers = this.options.map.tileLayers.map(() => []);
    for (let row = 0; row < this.grid.rows; row++) {
      for (let column = 0; column < this.grid.columns; column++) {
        const chunk = new Container();
        this.fillChunk(chunk, column, row);
        this.chunks.push(chunk);
        this.container.addChild(chunk);
      }
    }
  }

  /**
   * One container per tile layer for this chunk, back to front, holding
   * that layer's sprites and starting out as visible as the layer is.
   */
  private fillChunk(chunk: Container, column: number, row: number): void {
    const { map, tileTextures } = this.options;
    const { x0, y0, x1, y1 } = chunkCells(this.grid, column, row);

    map.tileLayers.forEach((layer, index) => {
      const layerContainer = new Container({ label: layer.name, visible: layer.visible });
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const texture = tileTextures.get(decodeGid(layer.data[y * map.width + x] ?? 0));
          if (!texture) {
            continue;
          }
          const sprite = new Sprite(texture);
          placeTileSprite(sprite, x, y, map.tileSize);
          layerContainer.addChild(sprite);
        }
      }
      chunk.addChild(layerContainer);
      this.layerContainers[index].push(layerContainer);
    });
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

/** Loads a map's tileset image and builds a {@link MapRenderSystem} for it. */
export async function createMapRenderSystem(map: ParsedMap): Promise<MapRenderSystem> {
  const source = await loadNearestSource(map.tileset.imageUrl);
  return new MapRenderSystem({ map, tileTextures: new TileTextureCache(map.tileset, source) });
}
