/**
 * Core liquid physics algorithm - shared between main thread and workers.
 * Uses an abstract IBlockAccessor interface to allow different data sources.
 */

import { getBlock } from '../blocks/BlockRegistry.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { getLiquidBlockId } from './LiquidRegistry.ts'
import type { BlockId } from '../interfaces/IBlock.ts'

/**
 * Liquid levels - full source is 8, flowing liquid decreases to 1.
 * Level 0 = air (not a liquid).
 */
export const LIQUID_LEVEL_MAX = 8
export const LIQUID_LEVEL_MIN = 1

/**
 * Abstract interface for block access.
 * Implemented differently on main thread (callbacks) vs workers (buffer access).
 */
export interface IBlockAccessor {
  /** Get block ID at world coordinates */
  getBlockId(x: number, y: number, z: number): BlockId
  /** Set block at world coordinates, returns true if changed */
  setBlock(x: number, y: number, z: number, blockId: BlockId): boolean
}

/**
 * Result of processing a liquid column.
 */
export interface LiquidColumnResult {
  /** Whether any liquid blocks changed */
  anyChanged: boolean
  /** World coordinates of columns that need to be re-queued */
  columnsToRequeue: Array<{ chunkX: number; chunkZ: number }>
}

/**
 * Get the liquid level (1-8) for a block ID. 0 = not a liquid.
 */
export function getLiquidLevel(blockId: BlockId): number {
  return getBlock(blockId).properties.liquidLevel ?? 0
}

/**
 * Get the liquid family (e.g., 'water', 'lava') for a block ID.
 * Returns undefined if not a liquid.
 */
export function getLiquidFamily(blockId: BlockId): string | undefined {
  return getBlock(blockId).properties.liquidFamily
}

/**
 * Check if a block is any type of liquid.
 */
export function isLiquidBlock(blockId: BlockId): boolean {
  return getBlock(blockId).properties.isLiquid
}

/**
 * Check if a block is solid (can't flow into).
 * A block is solid if it's not air and not a liquid.
 */
export function isSolid(blockId: BlockId): boolean {
  return blockId !== BlockIds.AIR && !isLiquidBlock(blockId)
}

/**
 * Check if this liquid block has a source (liquid of same family above or adjacent at same/higher level).
 */
function hasLiquidSource(
  accessor: IBlockAccessor,
  x: number,
  y: number,
  z: number,
  myLevel: number,
  myFamily: string
): boolean {
  // Liquid directly above of same family is always a source
  const aboveId = accessor.getBlockId(x, y + 1, z)
  if (getLiquidFamily(aboveId) === myFamily) return true

  // Check horizontal neighbors for source blocks or higher level of same family
  const neighbors = [
    { x: x + 1, z },
    { x: x - 1, z },
    { x, z: z + 1 },
    { x, z: z - 1 },
  ]

  for (const n of neighbors) {
    const nId = accessor.getBlockId(n.x, y, n.z)
    const nFamily = getLiquidFamily(nId)
    if (nFamily !== myFamily) continue

    const nLevel = getLiquidLevel(nId)
    // Source block (level 8) or higher level liquid feeds us
    if (nLevel >= myLevel) return true
  }

  return false
}

/**
 * Process a single liquid block using Minecraft-style flow.
 * Returns true if any change occurred, and populates columnsToRequeue with chunks that need processing.
 */
export function processLiquidBlock(
  accessor: IBlockAccessor,
  x: number,
  y: number,
  z: number,
  chunkSize: number,
  columnsToRequeue: Set<string>
): boolean {
  const blockId = accessor.getBlockId(x, y, z)
  const level = getLiquidLevel(blockId)
  const family = getLiquidFamily(blockId)

  if (level <= 0 || !family) return false

  let changed = false
  const belowId = accessor.getBlockId(x, y - 1, z)
  const belowFamily = getLiquidFamily(belowId)

  // Get the source block ID for this liquid family
  const sourceBlockId = getLiquidBlockId(family, LIQUID_LEVEL_MAX)

  // === STEP 0: SOURCE CREATION (Minecraft infinite liquid) ===
  // If this is flowing liquid on a solid block with 2+ adjacent source blocks of same family, become a source
  if (level < LIQUID_LEVEL_MAX && isSolid(belowId)) {
    let sourceCount = 0

    // Check horizontal neighbors for sources of same family
    const n1 = accessor.getBlockId(x + 1, y, z)
    const n2 = accessor.getBlockId(x - 1, y, z)
    const n3 = accessor.getBlockId(x, y, z + 1)
    const n4 = accessor.getBlockId(x, y, z - 1)

    if (getLiquidFamily(n1) === family && getLiquidLevel(n1) >= LIQUID_LEVEL_MAX) sourceCount++
    if (getLiquidFamily(n2) === family && getLiquidLevel(n2) >= LIQUID_LEVEL_MAX) sourceCount++
    if (getLiquidFamily(n3) === family && getLiquidLevel(n3) >= LIQUID_LEVEL_MAX) sourceCount++
    if (getLiquidFamily(n4) === family && getLiquidLevel(n4) >= LIQUID_LEVEL_MAX) sourceCount++

    // Also count liquid above of same family as a source
    if (sourceCount < 2) {
      const aboveId = accessor.getBlockId(x, y + 1, z)
      if (getLiquidFamily(aboveId) === family) sourceCount++
    }

    // 2+ sources = become a source block
    if (sourceCount >= 2) {
      if (accessor.setBlock(x, y, z, sourceBlockId)) {
        return true // Changed to source, let next tick handle spreading
      }
      return false // Already a source somehow
    }
  }

  // Helper to queue a column based on world coordinates
  const queueColumnAt = (wx: number, wz: number) => {
    const chunkX = Math.floor(wx / chunkSize)
    const chunkZ = Math.floor(wz / chunkSize)
    columnsToRequeue.add(`${chunkX},${chunkZ}`)
  }

  // === STEP 1: FLOW DOWN ===
  if (belowId === BlockIds.AIR) {
    // Flow down into air - create full liquid (falling liquid is full)
    if (accessor.setBlock(x, y - 1, z, sourceBlockId)) {
      changed = true
      queueColumnAt(x, z) // Same column, but queue for next tick
    }
  } else if (belowFamily === family) {
    // Below is same liquid family - make it full if not already
    const belowLevel = getLiquidLevel(belowId)
    if (belowLevel < LIQUID_LEVEL_MAX) {
      if (accessor.setBlock(x, y - 1, z, sourceBlockId)) {
        changed = true
      }
    }
  }

  // === STEP 2: HORIZONTAL SPREAD (only if can't flow down) ===
  if (isSolid(belowId) || (belowFamily === family && getLiquidLevel(belowId) >= LIQUID_LEVEL_MAX)) {
    // Calculate the level we spread at
    const spreadLevel = level - 1

    if (spreadLevel >= LIQUID_LEVEL_MIN) {
      const spreadBlockId = getLiquidBlockId(family, spreadLevel)
      const neighbors = [
        { x: x + 1, z },
        { x: x - 1, z },
        { x, z: z + 1 },
        { x, z: z - 1 },
      ]

      for (const n of neighbors) {
        const nId = accessor.getBlockId(n.x, y, n.z)
        const nFamily = getLiquidFamily(nId)
        const nLevel = getLiquidLevel(nId)

        // Can spread into air
        if (nId === BlockIds.AIR) {
          if (accessor.setBlock(n.x, y, n.z, spreadBlockId)) {
            changed = true
            queueColumnAt(n.x, n.z) // Queue neighbor chunk for processing
          }
        } else if (nFamily === family && nLevel < spreadLevel) {
          // Upgrade lower liquid of same family to our spread level
          if (accessor.setBlock(n.x, y, n.z, spreadBlockId)) {
            changed = true
            queueColumnAt(n.x, n.z) // Queue neighbor chunk for processing
          }
        }
      }
    }
  }

  // === STEP 3: DRY UP if no source ===
  // Non-source liquid (level < 8) needs a source to persist
  if (level < LIQUID_LEVEL_MAX) {
    if (!hasLiquidSource(accessor, x, y, z, level, family)) {
      // No source - dry up
      if (accessor.setBlock(x, y, z, BlockIds.AIR)) {
        changed = true
      }
    }
  }

  return changed
}

/**
 * Process all liquid blocks in a column.
 * liquidPositions should be sorted top-to-bottom (descending Y) for proper flow.
 */
export function processLiquidColumn(
  accessor: IBlockAccessor,
  baseX: number,
  baseZ: number,
  chunkSize: number,
  liquidPositions: Array<{ x: number; worldY: number; z: number }>
): LiquidColumnResult {
  if (liquidPositions.length === 0) {
    return { anyChanged: false, columnsToRequeue: [] }
  }

  // Sort by Y descending (top to bottom) for proper flow
  liquidPositions.sort((a, b) => b.worldY - a.worldY)

  const columnsToRequeue = new Set<string>()
  let anyChanged = false

  for (const pos of liquidPositions) {
    const worldX = baseX + pos.x
    const worldY = pos.worldY
    const worldZ = baseZ + pos.z

    const blockId = accessor.getBlockId(worldX, worldY, worldZ)
    if (isLiquidBlock(blockId)) {
      if (processLiquidBlock(accessor, worldX, worldY, worldZ, chunkSize, columnsToRequeue)) {
        anyChanged = true
      }
    }
  }

  // Convert set to array of column coordinates
  const result: Array<{ chunkX: number; chunkZ: number }> = []
  for (const key of columnsToRequeue) {
    const [xStr, zStr] = key.split(',')
    result.push({ chunkX: Number(xStr), chunkZ: Number(zStr) })
  }

  return { anyChanged, columnsToRequeue: result }
}
