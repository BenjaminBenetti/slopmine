import type { Chunk } from '../../chunks/Chunk.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'

/**
 * Detects and widens cave entrances at the surface.
 * Creates natural-looking openings where caves meet terrain.
 */
export class EntranceDetector {
  /**
   * Widen entrance points to create natural cave openings.
   * Groups nearby entrance blocks and expands them to minimum width.
   */
  widenEntrances(
    chunk: Chunk,
    entrances: Array<{ localX: number; y: number; localZ: number }>,
    settings: CaveSettings
  ): void {
    const { entranceMinWidth } = settings

    // Group nearby entrances to avoid processing duplicates
    const processed = new Set<string>()

    for (const entrance of entrances) {
      const key = `${entrance.localX},${entrance.localZ}`
      if (processed.has(key)) continue
      processed.add(key)

      // Find the highest air block at this column (entrance top)
      let entranceTop = entrance.y
      for (let y = entrance.y + 1; y < 256; y++) {
        if (chunk.getBlockId(entrance.localX, y, entrance.localZ) !== BlockIds.AIR) {
          break
        }
        entranceTop = y
      }

      // Widen the entrance horizontally
      const radius = Math.floor(entranceMinWidth / 2)
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const nx = entrance.localX + dx
          const nz = entrance.localZ + dz

          // Skip if outside chunk
          if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) {
            continue
          }

          // Skip if distance > radius (circular entrance)
          if (dx * dx + dz * dz > radius * radius) {
            continue
          }

          // Carve down from the entrance top
          for (let y = entranceTop; y >= entrance.y; y--) {
            const blockId = chunk.getBlockId(nx, y, nz)
            if (blockId !== BlockIds.AIR) {
              chunk.setBlockId(nx, y, nz, BlockIds.AIR)
            }
          }
        }
      }
    }
  }
}
