import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { SlugEntity } from '../../../entities/animals/slug/index.ts'
import { AlligatorEntity } from '../../../entities/animals/alligator/index.ts'
import { CaveSlimeEntity } from '../../../entities/animals/cave_slime/index.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { HerbFeature } from '../features/HerbFeature.ts'
import { CattailFeature } from '../features/CattailFeature.ts'
import { FlowerPatchFeature } from '../features/FlowerPatchFeature.ts'
import { SubmergedPlantFeature } from '../features/SubmergedPlantFeature.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import type { IDecorationWorld } from '../IDecorationWorld.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Swamp biome with mud surface, clay subsurface, and scattered giant
 * mushrooms - most of them bioluminescent (blue, purple, foxfire green,
 * amber), their glowmoss mycelium spreading around their feet with glimmercaps
 * and lumen ferns in it. Features murky water pools at low elevations.
 */

/** Giant mushroom kinds: stem, cap, share of the mushrooms, and whether it glows. */
const MUSHROOM_KINDS: readonly { stem: number; cap: number; share: number; glows: boolean }[] = [
  { stem: BlockIds.MUSHROOM, cap: BlockIds.MUSHROOM_CAP, share: 0.34, glows: false },
  { stem: BlockIds.BLUE_MUSHROOM, cap: BlockIds.BLUE_MUSHROOM_CAP, share: 0.17, glows: true },
  { stem: BlockIds.PURPLE_MUSHROOM, cap: BlockIds.PURPLE_MUSHROOM_CAP, share: 0.17, glows: true },
  { stem: BlockIds.FOXFIRE_MUSHROOM, cap: BlockIds.FOXFIRE_MUSHROOM_CAP, share: 0.16, glows: true },
  { stem: BlockIds.AMBER_MUSHROOM, cap: BlockIds.AMBER_MUSHROOM_CAP, share: 0.16, glows: true },
]

/** Glowmoss carpet radius around a glowing mushroom (blocks, before the ragged edge). */
const MOSS_CARPET_MIN_RADIUS = 3
const MOSS_CARPET_EXTRA_RADIUS = 3

/** Ground a giant mushroom or swamp plant may stand on. */
const MUSHROOM_GROUND: readonly number[] = [BlockIds.MUDDY_GRASS, BlockIds.MUD, BlockIds.CLAY, BlockIds.GLOWMOSS]

interface MushroomSite {
  readonly x: number
  readonly z: number
  readonly kind: (typeof MUSHROOM_KINDS)[number]
}
export class SwampGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'swamp',
    frequency: 0.5,
    treeDensity: 8.0, // Mushroom density
    features: [
      // Clay mounds
      new CliffFeature({
        frequency: 0.015,
        threshold: 0.65,
        maxHeight: 2,
        block: BlockIds.CLAY,
      }),
      // Common ores - coal spawns near surface
      new OreFeature({
        blockId: BlockIds.COAL_BLOCK,
        frequency: 20,
        veinSize: 12,
        minY: 156,
        maxY: 256,
        peakY: 214,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE, BlockIds.CLAY],
      }),
      // Iron spawns mid-level
      new OreFeature({
        blockId: BlockIds.IRON_BLOCK,
        frequency: 12,
        veinSize: 8,
        minY: 156,
        maxY: 220,
        peakY: 188,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE, BlockIds.CLAY],
      }),
      // Copper spawns similar to iron but slightly higher
      new OreFeature({
        blockId: BlockIds.COPPER_BLOCK,
        frequency: 10,
        veinSize: 10,
        minY: 156,
        maxY: 236,
        peakY: 204,
        ySpread: 20,
        replaceableBlocks: [BlockIds.STONE, BlockIds.CLAY],
      }),
      // Gold spawns deep and rarely
      new OreFeature({
        blockId: BlockIds.GOLD_BLOCK,
        frequency: 4,
        veinSize: 6,
        minY: 156,
        maxY: 188,
        peakY: 168,
        ySpread: 8,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Diamond spawns very deep and very rarely
      new OreFeature({
        blockId: BlockIds.DIAMOND_BLOCK,
        frequency: 2,
        veinSize: 4,
        minY: 156,
        maxY: 172,
        peakY: 164,
        ySpread: 4,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Herb patches - moderate density on muddy grass
      new HerbFeature({
        density: 2.5,
        minPatchSize: 2,
        maxPatchSize: 5,
        gridSize: 14,
        validGroundBlocks: [BlockIds.MUDDY_GRASS, BlockIds.GLOWMOSS],
      }),
      // Glimmercap tufts in the glowmoss (grid sizes differ from the fern's:
      // FlowerPatchFeature salts are fixed, so equal grids would share centres)
      new FlowerPatchFeature({
        density: 12,
        minPatchSize: 3,
        maxPatchSize: 7,
        gridSize: 5,
        flowerBlockIds: [BlockIds.GLIMMERCAP],
        validGroundBlocks: [BlockIds.GLOWMOSS],
      }),
      // Lumen ferns all over the swamp floor
      new FlowerPatchFeature({
        density: 7,
        minPatchSize: 1,
        maxPatchSize: 3,
        gridSize: 7,
        flowerBlockIds: [BlockIds.LUMEN_FERN],
        validGroundBlocks: [BlockIds.MUDDY_GRASS, BlockIds.GLOWMOSS],
      }),
      // Cattail reeds on the mud banks of the swamp pools (surface slow
      // falling ingredient); after the clay mounds so they root on both
      new CattailFeature({
        waterLevel: 234,
        waterBlockId: BlockIds.SWAMP_WATER,
        maxHeightAboveWater: 1,
        zoneFrequency: 0.02,
        zoneThreshold: 0.4,
        density: 0.55,
        // The defaults plus glowmoss, which carpets some of the banks
        validGroundBlocks: [BlockIds.GRASS, BlockIds.DIRT, BlockIds.MUD, BlockIds.CLAY, BlockIds.GLOWMOSS],
      }),
      // Glowkelp forests and lanternweed beds in the pools (after the reeds,
      // which check the water line for open water)
      new SubmergedPlantFeature({
        waterLevel: 234,
        waterBlockId: BlockIds.SWAMP_WATER,
        validBedBlocks: [BlockIds.MUD, BlockIds.CLAY, BlockIds.MUDDY_GRASS, BlockIds.DIRT],
        strands: {
          stalkBlockId: BlockIds.GLOWKELP,
          topBlockId: BlockIds.GLOWKELP_TOP,
          minDepth: 2,
          surfaceChance: 0.6,
          zoneFrequency: 0.035,
          zoneThreshold: 0.55,
          density: 0.32,
        },
        bedPlant: {
          blockId: BlockIds.LANTERNWEED,
          zoneFrequency: 0.05,
          zoneThreshold: 0.5,
          density: 0.22,
        },
      }),
    ],
    caves: {
      enabled: true,
      minY: 150,
      maxY: 320,
      floorFadeDepth: 10,
      surfaceFalloffDepth: 14,
      // Wide, flat, muddy chambers with enough diving tunnels to explore down
      cheese: { enabled: true, threshold: 0.44, scale: 0.011, verticalScale: 1.6 },
      spaghetti: { enabled: true, thickness: 0.075, thicknessVariance: 0.6, scale: 0.013, verticalSquash: 1.2 },
      // No ravines in the soft waterlogged ground
      ravine: { enabled: false, scale: 0.003, width: 0.03, depth: 40, taper: 0.75, density: 0.3 },
      // Muddy sinkhole entrances
      entrance: { enabled: true, scale: 0.01, threshold: 0.81, boost: 0.6, depth: 30 },
      // The deep swamp caves are waterlogged
      floodLevel: 168,
      floodBlockId: BlockIds.SWAMP_WATER,
      liquidSurfaceGuardY: 236,   // waterLevel 234 + 2: guards entrance mouths, pipes, and (partially) ravines under pools and shores
    },
    // Swamp water - murky water pools throughout
    water: {
      enabled: true,
      liquidBlock: BlockIds.SWAMP_WATER,
      waterLevel: 234,
      frequency: 0.5,  // Lots of water in swamps
      minDepth: 2,     // Shallow pools
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 3,
          persistence: 0.35,
          scale: 0.006,
          weight: 1.0,
        },
        // Low rolling hills for swamp
        {
          type: 'fractal',
          octaves: 2,
          persistence: 0.5,
          scale: 0.015,
          weight: 0.3,
        },
      ],
      baseHeight: -5, // Lower terrain so more is below water level
      heightScale: 10, // Slightly more variation for water pools
      combineMode: 'add',
    } as TerrainConfig,
    // Swamp has a darker, murky atmosphere: an overcast, olive-grey sky and
    // haze, and dimmed daylight (eased in while the player is here - not a
    // per-chunk skylight cap, whose region border was a hard light step)
    skybox: {
      brightness: 0.7, // darker, overcast sky
      tint: { r: 0.85, g: 0.9, b: 0.78 }, // Slight greenish-brown tint
      fogColor: { r: 0.64, g: 0.69, b: 0.62 }, // Grey-green murk (darkened by brightness)
      fogDensity: 1.2,
      lightTint: { r: 0.94, g: 0.96, b: 0.88 },
      daylight: 0.62, // overcast: gloomy but readable
      clouds: { coverage: 0.65, color: { r: 0.7, g: 0.72, b: 0.68 } }, // grey overcast deck
    },

    // Entity spawns for swamp biome
    entitySpawns: [
      {
        entityType: 'slug',
        spawnRate: 0.12, // Moderate spawn rate
        maxNearby: 8, // Don't overcrowd
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new SlugEntity({ position: pos }),
      },
      {
        entityType: 'alligator',
        spawnRate: 0.08, // Slightly rarer than slugs
        minY: 230, // Near/below swamp water level (234)
        maxY: 250,
        maxNearby: 6, // Fewer alligators - they're dangerous
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new AlligatorEntity({ position: pos }),
      },
      {
        entityType: 'cave_slime',
        spawnRate: 0.15, // Common in dark caves
        maxNearby: 8,
        maxLightLevel: 7, // Only spawn in dark areas
        createEntity: (pos: THREE.Vector3) => new CaveSlimeEntity({ position: pos }),
      },
    ],
  }

  // Mushroom placement grid size
  private readonly MUSHROOM_GRID_SIZE = 10

  /**
   * The giant mushroom of the placement cell at (cellWorldX, cellWorldZ), if
   * the cell has one: a jittered grid anchored to each chunk's origin. Pure,
   * so the worker's terrain fill (glowmoss carpets) and the main-thread
   * decorations agree on where the mushrooms grow.
   */
  private mushroomSite(cellWorldX: number, cellWorldZ: number): MushroomSite | null {
    const gridSize = this.MUSHROOM_GRID_SIZE
    const x = cellWorldX + Math.floor(this.positionRandom(cellWorldX, cellWorldZ, 1) * gridSize)
    const z = cellWorldZ + Math.floor(this.positionRandom(cellWorldX, cellWorldZ, 2) * gridSize)
    if (this.positionRandom(x, z, 0) > this.properties.treeDensity / (gridSize * gridSize)) return null
    let pick = this.positionRandom(x, z, 200)
    for (const kind of MUSHROOM_KINDS) {
      pick -= kind.share
      if (pick < 0) return { x, z, kind }
    }
    return { x, z, kind: MUSHROOM_KINDS[MUSHROOM_KINDS.length - 1] }
  }

  /** Every mushroom site of a chunk (its placement cells). */
  private chunkMushroomSites(chunkWorldX: number, chunkWorldZ: number, out: MushroomSite[]): void {
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += this.MUSHROOM_GRID_SIZE) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += this.MUSHROOM_GRID_SIZE) {
        const site = this.mushroomSite(chunkWorldX + localX, chunkWorldZ + localZ)
        if (site) out.push(site)
      }
    }
  }

  /**
   * Whether the swamp floor at a column is glowmoss: a ragged carpet around
   * each glowing mushroom (its mycelium) and sparse patches of its own.
   */
  private isGlowmossAt(worldX: number, worldZ: number, glowingSites: readonly MushroomSite[], noise: SimplexNoise): boolean {
    const edge = noise.noise2D(worldX * 0.21 + 91.7, worldZ * 0.21 - 13.3) * 1.5
    for (const site of glowingSites) {
      const radius = MOSS_CARPET_MIN_RADIUS + this.positionRandom(site.x, site.z, 210) * MOSS_CARPET_EXTRA_RADIUS
      const dx = worldX - site.x
      const dz = worldZ - site.z
      if (Math.sqrt(dx * dx + dz * dz) < radius + edge) return true
    }
    const patch = noise.noise2D(worldX * 0.031 - 47.1, worldZ * 0.031 + 22.9) + 0.35 * noise.noise2D(worldX * 0.11 + 5.3, worldZ * 0.11 + 71.2)
    return patch > 0.78
  }

  /**
   * Fill terrain with mud, clay, and stone layers.
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const coord = chunk.coordinate
    const terrainFloor = this.config.seaLevel - this.config.terrainThickness

    // Glowing mushrooms whose moss carpet can reach this chunk (their cells are
    // anchored to each chunk, so look one chunk around)
    const glowingSites: MushroomSite[] = []
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        this.chunkMushroomSites(chunkWorldX + cx * CHUNK_SIZE_X, chunkWorldZ + cz * CHUNK_SIZE_Z, glowingSites)
      }
    }
    for (let i = glowingSites.length - 1; i >= 0; i--) {
      if (!glowingSites[i].kind.glows) glowingSites.splice(i, 1)
    }

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const height = getHeightAt(worldX, worldZ)

        // Layer boundaries (world Y)
        const mudStartY = height
        const mudEndY = height - 3  // 4 blocks of mud
        const clayStartY = mudEndY - 1
        const clayEndY = height - 10  // 7 blocks of clay
        const stoneStartY = clayEndY - 1
        const stoneEndY = terrainFloor

        // Top surface: muddy grass (or exposed mud near water for shoreline effect)
        if (mudStartY >= minY && mudStartY <= maxY && mudStartY >= terrainFloor) {
          const localY = mudStartY - minY
          const waterLevel = this.properties.water?.waterLevel ?? 234
          // Use exposed mud within 2 blocks of water level for muddy shoreline;
          // glowmoss grows over anything above the water, banks included
          const isNearWater = height <= waterLevel + 2
          const isMossy = height >= waterLevel && this.isGlowmossAt(worldX, worldZ, glowingSites, noise)
          const surface = isMossy ? BlockIds.GLOWMOSS : isNearWater ? BlockIds.MUD : BlockIds.MUDDY_GRASS
          chunk.setBlockId(localX, localY, localZ, surface)
        }

        // Below surface: mud
        for (let worldY = Math.min(mudStartY - 1, maxY); worldY >= Math.max(mudEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.MUD)
          }
        }

        // Mid layer: clay
        for (let worldY = Math.min(clayStartY, maxY); worldY >= Math.max(clayEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.CLAY)
          }
        }

        // Base: stone
        for (let worldY = Math.min(stoneStartY, maxY); worldY >= Math.max(stoneEndY, minY); worldY--) {
          const localY = worldY - minY
          chunk.setBlockId(localX, localY, localZ, BlockIds.STONE)
        }
      }
    }
  }

  protected override async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    await this.generateMushrooms(chunk, world)
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: IDecorationWorld
  ): Promise<void> {
    await this.generateMushroomsForSubChunk(subChunk, world)
  }

  /**
   * Generate scattered mushrooms for a specific sub-chunk.
   */
  private async generateMushroomsForSubChunk(
    subChunk: ISubChunkData,
    world: IDecorationWorld
  ): Promise<void> {
    const coord = subChunk.coordinate
    const minSubY = Number(coord.subY) * SUB_CHUNK_HEIGHT
    const maxSubY = minSubY + SUB_CHUNK_HEIGHT - 1

    const sites: MushroomSite[] = []
    this.chunkMushroomSites(Number(coord.x) * CHUNK_SIZE_X, Number(coord.z) * CHUNK_SIZE_Z, sites)

    let mushroomsPlaced = 0
    for (const site of sites) {
      const mushroomBaseY = this.getHeightAt(site.x, site.z) + 1
      // Only place mushroom if its base is within this sub-chunk
      if (mushroomBaseY < minSubY || mushroomBaseY > maxSubY) continue
      if (this.tryPlaceMushroom(world, site, mushroomBaseY)) {
        mushroomsPlaced++
        // Yield every 5 mushrooms to prevent frame blocking
        if (mushroomsPlaced % 5 === 0) await this.yieldToEventLoop()
      }
    }

    // Final yield after mushroom generation
    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered mushrooms for full chunk.
   */
  private async generateMushrooms(
    chunk: Chunk,
    world: IDecorationWorld
  ): Promise<void> {
    const coord = chunk.coordinate
    const sites: MushroomSite[] = []
    this.chunkMushroomSites(Number(coord.x) * CHUNK_SIZE_X, Number(coord.z) * CHUNK_SIZE_Z, sites)

    let mushroomsPlaced = 0
    for (const site of sites) {
      if (this.tryPlaceMushroom(world, site, this.getHeightAt(site.x, site.z) + 1)) {
        mushroomsPlaced++
        // Yield every 5 mushrooms to prevent frame blocking
        if (mushroomsPlaced % 5 === 0) await this.yieldToEventLoop()
      }
    }

    // Final yield after mushroom generation
    await this.yieldToEventLoop()
  }

  /** Grow the site's mushroom with its base at `baseY` if the ground suits it. */
  private tryPlaceMushroom(world: IDecorationWorld, site: MushroomSite, baseY: number): boolean {
    const x = BigInt(site.x)
    const y = BigInt(baseY)
    const z = BigInt(site.z)
    if (!this.canPlaceMushroom(world, x, y, z)) return false
    this.placeMushroom(world, x, y, z, site.kind)
    return true
  }

  /**
   * Check if a mushroom can be placed at the given location.
   * Basic check for suitable ground.
   */
  private canPlaceMushroom(
    world: IDecorationWorld,
    x: bigint,
    y: bigint,
    z: bigint
  ): boolean {
    // Typical swamp ground below (muddy grass, mud, clay or glowmoss)
    if (!MUSHROOM_GROUND.includes(world.getBlockId(x, y - 1n, z))) return false

    // Check that base position is air
    const blockAt = world.getBlockId(x, y, z)
    if (blockAt !== BlockIds.AIR) return false

    return true
  }

  /**
   * Check if there's enough clearance for a mushroom of given height.
   */
  private hasMushroomClearance(
    world: IDecorationWorld,
    x: bigint,
    y: bigint,
    z: bigint,
    height: number,
    capRadius: number
  ): boolean {
    // Check vertical clearance for stem
    for (let h = 0; h < height; h++) {
      const blockAt = world.getBlockId(x, y + BigInt(h), z)
      if (blockAt !== BlockIds.AIR) return false
    }

    // Check clearance for cap
    const capY = y + BigInt(height)
    for (let dx = -capRadius; dx <= capRadius; dx++) {
      for (let dz = -capRadius; dz <= capRadius; dz++) {
        const dist = Math.abs(dx) + Math.abs(dz)
        if (dist > capRadius + 1) continue
        const blockAt = world.getBlockId(x + BigInt(dx), capY, z + BigInt(dz))
        if (blockAt !== BlockIds.AIR) return false
      }
    }

    return true
  }

  /**
   * Place a giant mushroom at the given location.
   * Creates a tall stem with a wide cap on top.
   */
  private placeMushroom(
    world: IDecorationWorld,
    x: bigint,
    y: bigint,
    z: bigint,
    kind: MushroomSite['kind']
  ): void {
    const stemBlock = kind.stem
    const capBlock = kind.cap

    // Determine height based on position (4-12 blocks)
    const heightRandom = this.positionRandom(Number(x), Number(z), 100)
    let height = Math.floor(4 + heightRandom * 8)
    let capRadius = this.getCapRadius(height)

    // Try to find a height that fits, reducing if needed
    while (height >= 4 && !this.hasMushroomClearance(world, x, y, z, height, capRadius)) {
      height -= 2
      capRadius = this.getCapRadius(height)
    }

    // If no room even for minimum height, place single block
    if (height < 4) {
      world.setBlock(x, y, z, stemBlock)
      return
    }

    // Build stem (mushroom blocks)
    for (let h = 0; h < height; h++) {
      world.setBlock(x, y + BigInt(h), z, stemBlock)
    }

    // Build cap (mushroom cap blocks)
    const capY = y + BigInt(height)

    // Create circular cap with overhang
    for (let dx = -capRadius; dx <= capRadius; dx++) {
      for (let dz = -capRadius; dz <= capRadius; dz++) {
        // Skip corners for rounder appearance
        const dist = Math.abs(dx) + Math.abs(dz)
        if (dist > capRadius + 1) continue

        // Top layer of cap
        world.setBlock(
          x + BigInt(dx),
          capY,
          z + BigInt(dz),
          capBlock
        )

        // Add hanging edges for taller mushrooms
        if (height >= 6 && dist === capRadius + 1) {
          world.setBlock(
            x + BigInt(dx),
            capY - 1n,
            z + BigInt(dz),
            capBlock
          )
        }
      }
    }

    // Add a second layer on top for extra bulk on tall mushrooms
    if (height >= 8) {
      const innerRadius = Math.max(1, capRadius - 1)
      for (let dx = -innerRadius; dx <= innerRadius; dx++) {
        for (let dz = -innerRadius; dz <= innerRadius; dz++) {
          const dist = Math.abs(dx) + Math.abs(dz)
          if (dist <= innerRadius) {
            world.setBlock(
              x + BigInt(dx),
              capY + 1n,
              z + BigInt(dz),
              capBlock
            )
          }
        }
      }
    }
  }

  /**
   * Get cap radius based on mushroom height.
   */
  private getCapRadius(height: number): number {
    if (height <= 5) return 2
    if (height <= 8) return 3
    return 4
  }
}
