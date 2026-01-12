/**
 * Registry for liquid block lookups.
 * Provides mapping from (family, level) -> BlockId
 */

import { BlockRegistry } from '../blocks/BlockRegistry.ts'
import type { BlockId } from '../interfaces/IBlock.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

export class LiquidRegistry {
  private static instance: LiquidRegistry | null = null

  // Map: "water:8" -> BlockIds.WATER
  private readonly familyLevelToBlockId: Map<string, BlockId> = new Map()

  private constructor() {
    this.buildIndex()
  }

  static getInstance(): LiquidRegistry {
    if (!LiquidRegistry.instance) {
      LiquidRegistry.instance = new LiquidRegistry()
    }
    return LiquidRegistry.instance
  }

  /**
   * Reset the registry (useful for testing or reinitialization).
   */
  static reset(): void {
    LiquidRegistry.instance = null
  }

  private buildIndex(): void {
    const registry = BlockRegistry.getInstance()
    for (const id of registry.getAllBlockIds()) {
      const block = registry.getBlock(id)
      const props = block.properties
      if (props.isLiquid && props.liquidFamily && props.liquidLevel) {
        const key = `${props.liquidFamily}:${props.liquidLevel}`
        this.familyLevelToBlockId.set(key, props.id)
      }
    }
  }

  /**
   * Get block ID for a liquid family and level.
   * Returns AIR if not found or if level <= 0.
   */
  getBlockId(family: string, level: number): BlockId {
    if (level <= 0) return BlockIds.AIR
    const key = `${family}:${level}`
    return this.familyLevelToBlockId.get(key) ?? BlockIds.AIR
  }

  /**
   * Get the source block ID (level 8) for a liquid family.
   */
  getSourceBlockId(family: string): BlockId {
    return this.getBlockId(family, 8)
  }
}

/**
 * Convenience function to get a liquid block ID by family and level.
 */
export function getLiquidBlockId(family: string, level: number): BlockId {
  return LiquidRegistry.getInstance().getBlockId(family, level)
}

/**
 * Convenience function to get the source block ID for a liquid family.
 */
export function getLiquidSourceBlockId(family: string): BlockId {
  return LiquidRegistry.getInstance().getSourceBlockId(family)
}
