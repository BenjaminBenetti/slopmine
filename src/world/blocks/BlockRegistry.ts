import type { BlockId, IBlock } from '../interfaces/IBlock.ts'
import type { IBlockRegistry } from '../interfaces/IBlockRegistry.ts'
import { BlockIds } from './BlockIds.ts'
import { AirBlock } from './Block.ts'

/**
 * Central registry for all block types.
 * Implements flyweight pattern - blocks are singleton instances.
 */
export class BlockRegistry implements IBlockRegistry {
  private static instance: BlockRegistry | null = null

  private readonly blocks: Map<BlockId, IBlock> = new Map()
  private readonly blocksByName: Map<string, IBlock> = new Map()
  private readonly airBlock: IBlock

  private constructor() {
    this.airBlock = new AirBlock()
    this.blocks.set(BlockIds.AIR, this.airBlock)
    this.blocksByName.set('air', this.airBlock)
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry()
    }
    return BlockRegistry.instance
  }

  /**
   * Reset the registry (useful for testing).
   */
  static reset(): void {
    BlockRegistry.instance = null
  }

  /**
   * Register a block instance. Properties are read from the block itself.
   */
  register(block: IBlock): void {
    const { id, name } = block.properties

    if (this.blocks.has(id)) {
      console.warn(`Block ID ${id} already registered, overwriting`)
    }

    if (this.blocksByName.has(name)) {
      console.warn(`Block name "${name}" already registered, overwriting`)
    }

    this.blocks.set(id, block)
    this.blocksByName.set(name, block)
  }

  getBlock(id: BlockId): IBlock {
    return this.blocks.get(id) ?? this.airBlock
  }

  getBlockByName(name: string): IBlock | undefined {
    return this.blocksByName.get(name)
  }

  isRegistered(id: BlockId): boolean {
    return this.blocks.has(id)
  }

  getAllBlockIds(): BlockId[] {
    return Array.from(this.blocks.keys())
  }

  getAllBlockNames(): string[] {
    return Array.from(this.blocksByName.keys())
  }
}

/**
 * Convenience function for block registration.
 */
export function registerBlock(block: IBlock): void {
  BlockRegistry.getInstance().register(block)
}

/**
 * Convenience function to get a block by ID.
 */
export function getBlock(id: BlockId): IBlock {
  return BlockRegistry.getInstance().getBlock(id)
}
