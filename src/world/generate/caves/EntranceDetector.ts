import type { Chunk } from '../../chunks/Chunk.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { HeightGetter } from './CaveCarver.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'

/**
 * Generates natural cave entrances by carving shafts from surface down to caves.
 * Uses 2D noise to determine entrance locations.
 */
export class EntranceDetector {
  private readonly noise: SimplexNoise

  constructor(seed: number) {
    this.noise = new SimplexNoise(seed)
  }

  /**
   * Generate cave entrances by carving from surface down to existing caves.
   */
  generateEntrances(
    chunk: Chunk,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): void {
    const { entranceMinWidth, maxY } = settings
    const coord = chunk.coordinate

    // Check potential entrance locations using a grid
    const gridSize = 16 // Check every 16 blocks
    const entranceFrequency = 0.01 // Low frequency = sparse entrances
    const entranceThreshold = 0.7 // High threshold = rare entrances

    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use 2D noise to determine if this location should have an entrance
        const entranceNoise = this.noise.noise2D(
          worldX * entranceFrequency,
          worldZ * entranceFrequency
        )

        if (entranceNoise < entranceThreshold) {
          continue
        }

        const surfaceY = getHeightAt(worldX, worldZ)

        // Find the highest cave (air block) in this column below maxY
        let caveY = -1
        for (let y = Math.min(maxY, surfaceY - 1); y >= settings.minY; y--) {
          if (chunk.getBlockId(localX, y, localZ) === BlockIds.AIR) {
            caveY = y
            break
          }
        }

        // No cave found in this column, skip
        if (caveY === -1) {
          continue
        }

        // Carve entrance from surface down to cave
        this.carveEntrance(
          chunk,
          localX,
          localZ,
          surfaceY,
          caveY,
          entranceMinWidth
        )
      }
    }
  }

  /**
   * Carve a gradual sloped entrance from surface down to cave level.
   * Creates a walkable ramp by moving horizontally as it descends.
   */
  private carveEntrance(
    chunk: Chunk,
    centerX: number,
    centerZ: number,
    surfaceY: number,
    caveY: number,
    width: number
  ): void {
    const radius = Math.max(2, Math.floor(width / 2))
    const depth = surfaceY - caveY

    // Pick a random direction for the slope using position-based seed
    const dirSeed = (centerX * 73856093) ^ (centerZ * 19349663)
    const angle = (dirSeed % 360) * (Math.PI / 180)
    const dirX = Math.cos(angle)
    const dirZ = Math.sin(angle)

    // Slope ratio: move 2 blocks horizontally for every 1 block down (gentle slope)
    const slopeRatio = 2.0

    let currentX = centerX
    let currentZ = centerZ

    // Carve from surface down to cave with horizontal movement
    for (let y = surfaceY; y >= caveY; y--) {
      const progress = (surfaceY - y) / depth

      // Carve a tunnel cross-section at this Y level
      // Height of 3 blocks so player can walk through
      for (let dy = 0; dy < 3; dy++) {
        const carveY = y + dy
        if (carveY > surfaceY) continue

        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            const nx = Math.floor(currentX) + dx
            const nz = Math.floor(currentZ) + dz

            // Skip if outside chunk
            if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) {
              continue
            }

            // Circular/oval tunnel shape
            if (dx * dx + dz * dz > radius * radius) {
              continue
            }

            chunk.setBlockId(nx, carveY, nz, BlockIds.AIR)
          }
        }
      }

      // Move horizontally as we descend (creates the slope)
      currentX += dirX * slopeRatio
      currentZ += dirZ * slopeRatio
    }
  }
}
