import type { BlockId } from '../../world/interfaces/IBlock.ts'

/**
 * Callback for simple block interactions (no UI needed).
 * @param worldX Block world X coordinate
 * @param worldY Block world Y coordinate  
 * @param worldZ Block world Z coordinate
 * @param metadata Block metadata
 * @returns true if interaction was handled, false otherwise
 */
export type BlockActionCallback = (
  worldX: bigint,
  worldY: bigint,
  worldZ: bigint,
  metadata: number
) => boolean

/**
 * Registry for simple block actions that don't need a UI.
 * Used for blocks like beds that just perform an action on E key.
 */
export class BlockActionRegistry {
  private static instance: BlockActionRegistry | null = null
  private readonly actions: Map<BlockId, BlockActionCallback> = new Map()

  private constructor() {}

  static getInstance(): BlockActionRegistry {
    if (!BlockActionRegistry.instance) {
      BlockActionRegistry.instance = new BlockActionRegistry()
    }
    return BlockActionRegistry.instance
  }

  /**
   * Register a simple action for a block type.
   */
  register(blockId: BlockId, callback: BlockActionCallback): void {
    this.actions.set(blockId, callback)
  }

  /**
   * Check if a block type has a registered action.
   */
  hasAction(blockId: BlockId): boolean {
    return this.actions.has(blockId)
  }

  /**
   * Execute the action for a block.
   * Returns true if the action was handled.
   */
  executeAction(
    blockId: BlockId,
    worldX: bigint,
    worldY: bigint,
    worldZ: bigint,
    metadata: number
  ): boolean {
    const callback = this.actions.get(blockId)
    if (!callback) return false
    return callback(worldX, worldY, worldZ, metadata)
  }
}

export const blockActionRegistry = BlockActionRegistry.getInstance()
