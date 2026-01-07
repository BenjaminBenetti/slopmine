import type { IBlockUI, BlockUIFactory } from './interfaces/IBlockUI.ts'
import type { IBlockState } from '../../world/blockstate/interfaces/IBlockState.ts'
import type { BlockId } from '../../world/interfaces/IBlock.ts'

/**
 * Registry that maps block IDs to UI factories.
 * Used to create appropriate UI panels when interacting with blocks.
 */
export class BlockUIRegistry {
  private static instance: BlockUIRegistry | null = null
  private readonly factories: Map<BlockId, BlockUIFactory<IBlockState>> = new Map()

  private constructor() {}

  static getInstance(): BlockUIRegistry {
    if (!BlockUIRegistry.instance) {
      BlockUIRegistry.instance = new BlockUIRegistry()
    }
    return BlockUIRegistry.instance
  }

  /**
   * Register a UI factory for a block type.
   */
  register<TState extends IBlockState>(
    blockId: BlockId,
    factory: BlockUIFactory<TState>
  ): void {
    this.factories.set(blockId, factory as BlockUIFactory<IBlockState>)
  }

  /**
   * Check if a block type has a registered UI.
   */
  hasUI(blockId: BlockId): boolean {
    return this.factories.has(blockId)
  }

  /**
   * Create a UI for a block state.
   * Returns null if no UI is registered for this block type.
   */
  createUI(blockId: BlockId, state: IBlockState): IBlockUI | null {
    const factory = this.factories.get(blockId)
    if (!factory) return null
    return factory(state)
  }
}

export const blockUIRegistry = BlockUIRegistry.getInstance()
