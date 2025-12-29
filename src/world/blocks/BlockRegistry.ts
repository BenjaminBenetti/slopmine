import type { BlockId, IBlock } from '../interfaces/IBlock.ts'
import type { IBlockRegistry, IBlockRegistration } from '../interfaces/IBlockRegistry.ts'
import { AIR_BLOCK_ID } from '../interfaces/IBlock.ts'
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
    this.blocks.set(AIR_BLOCK_ID, this.airBlock)
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

  register(registration: IBlockRegistration): void {
    const { properties, factory } = registration

    if (this.blocks.has(properties.id)) {
      console.warn(`Block ID ${properties.id} already registered, overwriting`)
    }

    if (this.blocksByName.has(properties.name)) {
      console.warn(`Block name "${properties.name}" already registered, overwriting`)
    }

    const block = factory()
    this.blocks.set(properties.id, block)
    this.blocksByName.set(properties.name, block)
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
}

/**
 * Convenience function for block registration.
 */
export function registerBlock(registration: IBlockRegistration): void {
  BlockRegistry.getInstance().register(registration)
}

/**
 * Convenience function to get a block by ID.
 */
export function getBlock(id: BlockId): IBlock {
  return BlockRegistry.getInstance().getBlock(id)
}
