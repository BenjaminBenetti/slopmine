/**
 * Core liquid physics algorithm - shared between main thread and workers.
 * Uses an abstract IBlockAccessor interface to allow different data sources.
 */

import { getBlock } from '../blocks/BlockRegistry.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { getLiquidBlockId, getFallingLiquidBlockId } from './LiquidRegistry.ts'
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
 * Check if a block is falling liquid (a waterfall column segment).
 */
export function isFallingLiquid(blockId: BlockId): boolean {
  return getBlock(blockId).properties.isFallingLiquid === true
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
  columnsToRequeue: Set<string>,
  driedFallingColumns?: Set<string>
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

  // Helper to queue a column based on world coordinates (defined early so
  // the falling-liquid branch can use it)
  const queueColumn = (wx: number, wz: number) => {
    const chunkX = Math.floor(wx / chunkSize)
    const chunkZ = Math.floor(wz / chunkSize)
    columnsToRequeue.add(`${chunkX},${chunkZ}`)
  }

  // === FALLING LIQUID (waterfall column segment) ===
  // Falling liquid never spreads sideways and never becomes an infinite
  // source. It has exactly three behaviors:
  //  1. Landed on solid ground -> convert to a real source block, so the
  //     pool at the bottom of a waterfall forms and persists normally.
  //  2. Fed from directly above -> keep falling (extend the column down).
  //  3. Feed cut -> dry up. At most one segment per block-column dries per
  //     pass so a cut stream visibly peters out top-down.
  if (isFallingLiquid(blockId)) {
    if (isSolid(belowId)) {
      if (accessor.setBlock(x, y, z, sourceBlockId)) {
        queueColumn(x, z) // landed source spreads next tick
        return true
      }
      return false
    }

    const aboveId = accessor.getBlockId(x, y + 1, z)
    if (getLiquidFamily(aboveId) !== family) {
      // Stream cut - dry up (throttled to one segment per column per pass)
      const colKey = `${x},${z}`
      if (driedFallingColumns?.has(colKey)) {
        queueColumn(x, z) // keep draining next tick
        return false
      }
      driedFallingColumns?.add(colKey)
      if (accessor.setBlock(x, y, z, BlockIds.AIR)) {
        queueColumn(x, z)
        return true
      }
      return false
    }

    // Still fed: continue the fall downward
    if (belowId === BlockIds.AIR) {
      if (accessor.setBlock(x, y - 1, z, getFallingLiquidBlockId(family))) {
        queueColumn(x, z)
        return true
      }
    } else if (belowFamily === family && !isFallingLiquid(belowId) && getLiquidLevel(belowId) < LIQUID_LEVEL_MAX) {
      // Falling onto partial flow: overwhelm it with the falling column
      if (accessor.setBlock(x, y - 1, z, getFallingLiquidBlockId(family))) {
        queueColumn(x, z)
        return true
      }
    }
    return false
  }

  // === STEP 0: SOURCE CREATION (Minecraft infinite liquid) ===
  // If this is flowing liquid on a solid block with 2+ adjacent source blocks of same family, become a source
  if (level < LIQUID_LEVEL_MAX && isSolid(belowId)) {
    let sourceCount = 0

    // Check horizontal neighbors for sources of same family
    const n1 = accessor.getBlockId(x + 1, y, z)
    const n2 = accessor.getBlockId(x - 1, y, z)
    const n3 = accessor.getBlockId(x, y, z + 1)
    const n4 = accessor.getBlockId(x, y, z - 1)

    // Falling liquid is full-level but is NOT a source - without this
    // exclusion, two adjacent waterfalls would mint permanent lakes mid-air.
    if (getLiquidFamily(n1) === family && getLiquidLevel(n1) >= LIQUID_LEVEL_MAX && !isFallingLiquid(n1)) sourceCount++
    if (getLiquidFamily(n2) === family && getLiquidLevel(n2) >= LIQUID_LEVEL_MAX && !isFallingLiquid(n2)) sourceCount++
    if (getLiquidFamily(n3) === family && getLiquidLevel(n3) >= LIQUID_LEVEL_MAX && !isFallingLiquid(n3)) sourceCount++
    if (getLiquidFamily(n4) === family && getLiquidLevel(n4) >= LIQUID_LEVEL_MAX && !isFallingLiquid(n4)) sourceCount++

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

  // === STEP 1: FLOW DOWN ===
  if (belowId === BlockIds.AIR) {
    // Flow down into air as FALLING liquid: full-looking but not a source,
    // so cutting the stream above drains the column instead of leaving a
    // permanent pillar of water.
    if (accessor.setBlock(x, y - 1, z, getFallingLiquidBlockId(family))) {
      changed = true
      queueColumn(x, z) // Same column, but queue for next tick
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

  // === STEP 2: HORIZONTAL SPREAD (only when resting on solid ground) ===
  // Minecraft rule: liquid on top of liquid never spreads sideways - it only
  // feeds the column below. Only the liquid resting on a solid floor spreads.
  // This keeps waterfalls as narrow columns and stops a breached pool from
  // cascading sideways into caves at every depth of its water column.
  if (isSolid(belowId)) {
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
            queueColumn(n.x, n.z) // Queue neighbor chunk for processing
          }
        } else if (nFamily === family && nLevel < spreadLevel) {
          // Upgrade lower liquid of same family to our spread level
          if (accessor.setBlock(n.x, y, n.z, spreadBlockId)) {
            changed = true
            queueColumn(n.x, n.z) // Queue neighbor chunk for processing
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
  // Per-pass throttle: only one falling segment per block-column dries per
  // pass, so cut waterfalls peter out top-down instead of vanishing at once.
  const driedFallingColumns = new Set<string>()
  let anyChanged = false

  for (const pos of liquidPositions) {
    const worldX = baseX + pos.x
    const worldY = pos.worldY
    const worldZ = baseZ + pos.z

    const blockId = accessor.getBlockId(worldX, worldY, worldZ)
    if (isLiquidBlock(blockId)) {
      if (processLiquidBlock(accessor, worldX, worldY, worldZ, chunkSize, columnsToRequeue, driedFallingColumns)) {
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
